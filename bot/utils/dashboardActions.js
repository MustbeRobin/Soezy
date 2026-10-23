"use strict";
const { communityAction } = require('./dashboardCommunity');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, PermissionsBitField, SeparatorSpacingSize } = require('discord.js');
const fail = (message, status=400) => Object.assign(new Error(message), {status});
const id = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
function decodeIcon(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw fail('Upload a PNG, JPEG or WebP image. SVG and remote URLs are not accepted.');
  const data=Buffer.from(match[2],'base64');
  if (!data.length || data.length>65536) throw fail('Role icon upload must be 64 KB or smaller.');
  const mime=match[1];
  const valid=mime==='png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime==='jpeg' ? data[0]===255&&data[1]===216&&data[2]===255 : data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(!valid) throw fail('Image content does not match its file type.');
  return data;
}
function validateGuildProfileImage(value) {
  const match=typeof value==='string'&&value.match(/^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[2].length%4!==0)throw fail('Upload a PNG, JPEG or GIF image. SVG and remote URLs are not accepted.');
  const data=Buffer.from(match[2],'base64');
  if(!data.length||data.length>307200||data.toString('base64')!==match[2])throw fail('Each avatar or banner image must be 300 KB or smaller and use valid base64 data.');
  const mime=match[1];
  const valid=mime==='png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='jpeg'?data[0]===255&&data[1]===216&&data[2]===255:['GIF87a','GIF89a'].includes(data.toString('ascii',0,6));
  if(!valid)throw fail('Image content does not match its file type.');
  return value;
}
function createDashboardActions({getClient,loadDatabase,saveDatabase,canManageSecurity,botPrefix='!',onCommunityUpdated,isBotOwner,applyBotPresence}) {
  const locks=new Map();
  async function perform(guildId,request,actorId) {
    if (!id(guildId)||!id(actorId)||!request||typeof request!=='object'||Array.isArray(request))throw fail('Invalid action request.');
    const client=getClient(), guild=client?.guilds?.cache?.get(guildId);
    if(!guild)throw fail('Bot is not in this server.',404);
    const action=request.action;
    if(action==='botstatus.get'||action==='botstatus.set'){
      if(typeof isBotOwner!=='function'||!isBotOwner(actorId))throw fail('Only the configured bot owner can change the global bot status.',403);
      if(typeof applyBotPresence!=='function')throw fail('Global bot presence controls are unavailable in this runtime.',503);
      const db=loadDatabase();
      const current=db.botPresence&&typeof db.botPresence.message==='string'?db.botPresence:null;
      if(action==='botstatus.get')return {ok:true,presence:current?{message:current.message,activityType:current.activityType,status:current.status}:null,prefix:db.prefixes?.[guildId]||botPrefix};
      const previous=db.botPresence;
      if(request.reset===true){delete db.botPresence;}
      else{
        const types={playing:'Playing',watching:'Watching',listening:'Listening',competing:'Competing'};
        const activityType=types[String(request.activityType||'').toLowerCase()];
        const message=typeof request.message==='string'?request.message.trim():'';
        const presenceStatus=String(request.status||'online').toLowerCase();
        if(!activityType)throw fail('Choose Playing, Watching, Listening or Competing.');
        if(!message||message.length>128||/[\x00-\x1f\x7f]/.test(message))throw fail('Activity message must contain 1–128 characters without control characters.');
        if(!['online','idle','dnd'].includes(presenceStatus))throw fail('Choose Online, Idle or Do Not Disturb.');
        db.botPresence={message,activityType,status:presenceStatus};
      }
      try{
        await Promise.resolve(applyBotPresence(db.botPresence||null));
        await saveDatabase(db);
      }catch(error){
        if(previous===undefined)delete db.botPresence;else db.botPresence=previous;
        try{await Promise.resolve(applyBotPresence(db.botPresence||null));}catch{}
        throw fail('Could not apply and save the global bot status. The previous status was restored.',503);
      }
      return {ok:true,presence:db.botPresence||null,reset:request.reset===true};
    }
    if(['botGrant.add','botGrant.remove'].includes(request.action)) {
      if(typeof canManageSecurity!=='function'||!canManageSecurity(guildId,actorId))throw fail('Only the configured bot owner or an authorized ExtraOwner can change shared bot immunity.',403);
      const botId=String(request.botId||'').trim();
      if(!id(botId))throw fail('Enter a valid Discord bot user ID.');
      const bot=await client.users.fetch(botId).catch(()=>null);
      if(!bot?.bot)throw fail('Only a real Discord bot account can receive or lose bot immunity.');
      const db=loadDatabase(), g=db.guilds?.[guildId];
      if(!g)throw fail('Server configuration is unavailable.',404);
      if(typeof globalThis.syncGlobalWhitelistEntry!=='function')throw fail('Shared bot immunity is unavailable in this bot runtime.',503);
      globalThis.syncGuildWhitelist?.(g);
      const previous=structuredClone(g);
      const present=(g.whitelistUsers||[]).map(String).includes(botId);
      const grant=request.action==='botGrant.add';
      if(present!==grant){
        globalThis.syncGlobalWhitelistEntry(g,'user',botId,grant?'add':'remove',{fanout:true});
        try{
          const saved=await saveDatabase(db,guildId);
          if(saved===false)throw Error('save returned false');
        }catch{
          for(const key of Object.keys(g))delete g[key];
          Object.assign(g,previous);
          throw fail('Could not save the bot immunity change. No change was confirmed.',503);
        }
      }
      return {ok:true,changed:present!==grant,botId,username:bot?.username||null,granted:grant};
    }
    if (request.action === 'antiBetrayal.get' || request.action === 'antiBetrayal.set') {
      if (!client._antiBetrayal) throw fail('Anti-Betrayal runtime is unavailable.',503);
      return client._antiBetrayal.action(guildId,request,actorId);
    }
    let scopedReadAccess=false;
    if (['catalog','members.search'].includes(request.action) && client._antiBetrayal) {
      try { await client._antiBetrayal.action(guildId,{action:'antiBetrayal.get'},actorId); scopedReadAccess=true; } catch {}
    }
    const member=guild.members.cache.get(actorId)||await guild.members.fetch(actorId).catch(()=>null);
    const owner=guild.ownerId===actorId;
    if(!scopedReadAccess && (!member || !(owner||member.permissions.has(32n)||member.permissions.has(8n))))throw fail('Manage Server permission is required.',403);
    if(action==='botprofile.set'){
      const body={};
      for(const field of ['avatar','banner'])if(Object.hasOwn(request,field))body[field]=request[field]===null?null:validateGuildProfileImage(request[field]);
      if(Object.hasOwn(request,'bio')){
        if(typeof request.bio!=='string'||request.bio.length>190||/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(request.bio))throw fail('Bio must be text of 190 characters or fewer.');
        body.bio=request.bio;
      }
      if(!Object.keys(body).length)throw fail('Choose an avatar, banner or bio change before saving.');
      if(typeof guild.members.editMe!=='function')throw fail('Discord profile updates are unavailable in this bot runtime.',503);
      await guild.members.editMe({...body,reason:`Soezy dashboard profile update by ${actorId}`});
      return {ok:true,updated:Object.keys(body)};
    }
    const db=loadDatabase(); const g=db.guilds?.[guildId];if(!g)throw fail('Server configuration is unavailable.',404);

    if (typeof action === 'string' && action.startsWith('community.')) return communityAction({db,g,guild,member,request,actorId,saveDatabase,onCommunityUpdated});
    if(action==='members.search'){
      const query=typeof request.query==='string'?request.query.trim():'';
      if(query.length<2||query.length>32||/[\x00-\x1f]/.test(query))throw fail('Member search must be 2–32 characters.');
      if(typeof guild.members.search!=='function')throw fail('Member search is unavailable in this bot runtime.',503);
      let matches;
      try{matches=await guild.members.search({query,limit:25,cache:false});}
      catch{throw fail('Member search failed. Check that the bot has the Server Members Intent.',503);}
      return {ok:true,members:[...matches.values()].map(member=>({id:member.id,name:member.displayName||member.user.globalName||member.user.username,username:member.user.username}))};
    }
    if(action==='catalog')return {ok:true,channels:[...guild.channels.cache.values()].filter(c=>c.isTextBased?.()&&!c.isThread?.()).map(c=>({id:c.id,name:c.name})),roles:[...guild.roles.cache.values()].filter(r=>r.id!==guildId&&!r.managed).map(r=>({id:r.id,name:r.name,editable:!!r.editable})),roleIconsAvailable:guild.features.includes('ROLE_ICONS')};
    if(action==='prefix.get')return {ok:true,prefix:db.prefixes?.[guildId]||botPrefix,customPrefix:db.prefixes?.[guildId]||''};
    if(action==='prefix.set'){
      if(!owner&&!member.permissions.has(PermissionsBitField.Flags.Administrator)&&!member.permissions.has(PermissionsBitField.Flags.ManageGuild))throw fail('Server owner, Administrator, or Manage Server permission is required to change the prefix.',403);
      if(typeof request.prefix!=='string'||request.prefix.length>10||/[\s\x00-\x1f]/.test(request.prefix))throw fail('Prefix must be 1–10 characters with no whitespace, or empty to reset.');
      db.prefixes ||= {};const previous=db.prefixes[guildId];
      if(request.prefix)db.prefixes[guildId]=request.prefix;else delete db.prefixes[guildId];
      try{await saveDatabase(db,guildId)}catch(e){if(previous===undefined)delete db.prefixes[guildId];else db.prefixes[guildId]=previous;throw e}
      return {ok:true,prefix:db.prefixes[guildId]||botPrefix};
    }
    if(action==='autorole.get'||action==='autorole.set'){
      const current=g.autoRoles||{}, legacy=g.autorole||{};
      const values={userRoles:[...new Set([...(current.userRoles||[]),...(current[guildId]||[]),...(legacy.userRoles||[])])],botRoles:[...new Set([...(current.botRoles||[]),...(legacy.botRoles||[])])]};
      if(action==='autorole.get')return {ok:true,...values};
      if(!owner&&(!member.permissions.has(8n)||!member.permissions.has(268435456n)))throw fail('Administrator and Manage Roles permissions are required.',403);
      const me=guild.members.me||await guild.members.fetchMe();
      if(!me.permissions.has(268435456n))throw fail('Bot needs Manage Roles.',403);
      const next={};
      for(const kind of ['userRoles','botRoles']){
        const list=request[kind];
        if(!Array.isArray(list)||list.length>25||list.some(v=>!id(v))||new Set(list).size!==list.length)throw fail('Choose at most 25 distinct roles per member type.');
        if(list.length>1 && list.some(roleId=>!values[kind].includes(roleId)) && client._dashboardHasPremium?.(actorId,guildId)!==true)throw fail('Premium is required for multiple join roles per member type.',403);
        for(const roleId of list){
          const role=guild.roles.cache.get(roleId);
          if(!role||role.id===guildId||role.managed||!role.editable||role.position>=me.roles.highest.position||(!owner&&role.position>=member.roles.highest.position))throw fail('A selected role is unavailable or blocked by role hierarchy.',403);
          if([8n,32n,268435456n,16n,4n,2n].some(permission=>role.permissions?.has(permission)))throw fail('Administrator or server-management roles cannot be assigned automatically from the website.',403);
        }
        next[kind]=[...list];
      }
      const previous=g.autoRoles,oldLegacy=g.autorole;g.autoRoles={...current,...next};delete g.autoRoles[guildId];delete g.autorole;
      try{await saveDatabase(db,guildId)}catch(error){if(previous===undefined)delete g.autoRoles;else g.autoRoles=previous;if(oldLegacy!==undefined)g.autorole=oldLegacy;throw error;}
      return {ok:true,...next};
    }
    if(action==='ticket.panel.deploy'){
      const ticket=g.ticket;
      if(ticket?.enabled!==true)throw fail('Enable the ticket system before applying its panel.');
      if(!id(ticket.channel))throw fail('Set a panel channel before applying the panel.');
      const channel=guild.channels.cache.get(ticket.channel)||await guild.channels.fetch(ticket.channel).catch(()=>null);
      if(!channel?.isTextBased?.()||channel.isThread?.())throw fail('The configured panel channel is missing or is not a text channel.',404);
      if(!owner&&!channel.permissionsFor(member)?.has(1024n))throw fail('You cannot access the configured panel channel.',403);
      const me=guild.members.me||await guild.members.fetchMe();
      if(!channel.permissionsFor(me)?.has([1024n,2048n]))throw fail('Bot needs View Channel and Send Messages in the configured panel channel.',403);

      const embed=ticket.embed||{};
      const buttonLabel=String(ticket.buttonLabel||'Create Ticket').slice(0,80);
      const panel=new ContainerBuilder()
        .addTextDisplayComponents(text=>text.setContent(`## ${embed.title||'🎫 Support Tickets'}`))
        .addSeparatorComponents(separator=>separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(text=>text.setContent(embed.description||'Click the button below to open a support ticket.\n\nOur support team will assist you as soon as possible.'))
        .addSeparatorComponents(separator=>separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('create_ticket').setLabel(buttonLabel).setStyle(ButtonStyle.Primary)
        ))
        .addSeparatorComponents(separator=>separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(text=>text.setContent(`-# ${embed.footer||'Support Ticket System'}`));

      const sent=await channel.send({components:[panel],flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]}});
      const previousIds=ticket.panelMessageIds;
      ticket.panelMessageIds=[...new Set([...(previousIds||[]),sent.id])].slice(-25);
      let warning='';
      try{await saveDatabase(db,guildId);}catch{ticket.panelMessageIds=previousIds;warning='The panel was sent, but its message ID could not be saved for tracking.';}
      return {ok:true,channel:{id:channel.id,name:channel.name},messageUrl:`https://discord.com/channels/${guildId}/${channel.id}/${sent.id}`,warning};
    }
    if(action==='sticky.list')return {ok:true,enabled:g.stickySystem?.enabled===true,entries:Object.entries(g.stickyMessages||{}).map(([key,entry])=>({key,...entry}))};
    if(action==='sticky.upsert'||action==='sticky.delete'){
      if(!id(request.channelId))throw fail('Choose a valid channel.');
      const channel=guild.channels.cache.get(request.channelId);
      if(!channel?.isTextBased?.()||channel.isThread?.())throw fail('Choose a text channel in this server.');
      const me=guild.members.me||await guild.members.fetchMe();
      if(!channel.permissionsFor(me)?.has([1024n,2048n,65536n]))throw fail('Bot needs View Channel, Send Messages and Read Message History.',403);
      if(!owner&&!channel.permissionsFor(member)?.has(1024n))throw fail('You cannot access that channel.',403);
      const name=request.name;
      if(typeof name!=='string'||!/^[a-z0-9_-]{1,48}$/.test(name))throw fail('Sticky name: use 1–48 lowercase letters, numbers, hyphens or underscores.');
      const key=`${request.channelId}:${name}`;
      const previous=g.stickyMessages?.[key];
      // Imported legacy channel-only keys are supported without exposing arbitrary object paths.
      const actualKey=previous?key:Object.keys(g.stickyMessages||{}).find(k=>(g.stickyMessages[k]?.channelId||k.split(':')[0])===request.channelId&&(g.stickyMessages[k]?.name||'default')===name)||key;
      const existing=g.stickyMessages?.[actualKey];
      if(action==='sticky.delete'&&request.confirm!==true)throw fail('Confirm sticky deletion.');
      if(action==='sticky.delete'&&!existing)throw fail('Sticky message not found.',404);
      if(action==='sticky.upsert'){
        if(typeof request.content!=='string'||!request.content.trim()||request.content.length>2000)throw fail('Sticky message must contain 1–2000 characters.');
        if(!['plain','embed','container'].includes(request.mode))throw fail('Invalid sticky style.');
        if(typeof request.enabled!=='boolean')throw fail('Enabled must be a boolean.');
        if(/@(everyone|here)|<@&\d+>/.test(request.content))throw fail('Mass/role mentions are not allowed from the website.');
      }
      const oldSystem=g.stickySystem,oldFeatures=g.features,oldGuildSystems=db.guildSystems?.[guildId];
      g.stickyMessages ||= {};
      if(action==='sticky.delete')delete g.stickyMessages[actualKey];
      else {
        g.stickyMessages[actualKey]={...existing,name,channelId:request.channelId,content:request.content.trim(),enabled:request.enabled,mode:request.mode,useContainer:request.mode==='container',messageId:existing?.messageId||null};
        g.stickySystem={...oldSystem,enabled:true};g.features={...oldFeatures,sticky:true};
        db.guildSystems ||= {};db.guildSystems[guildId]={...oldGuildSystems,sticky:true};
      }
      try{await saveDatabase(db,guildId)}catch(e){if(existing)g.stickyMessages[actualKey]=existing;else delete g.stickyMessages[actualKey];g.stickySystem=oldSystem;g.features=oldFeatures;if(db.guildSystems){if(oldGuildSystems)db.guildSystems[guildId]=oldGuildSystems;else delete db.guildSystems[guildId];}throw e;}
      let warning='';
      if(action==='sticky.delete'||!request.enabled){
        if(existing?.messageId){try{const message=await channel.messages.fetch(existing.messageId);if(message.author?.id===client.user.id)await message.delete();}catch{warning='Saved. The old posted message could not be removed.';}}
      }else if(typeof client._dashboardRefreshSticky==='function'){
        try{await client._dashboardRefreshSticky(channel)}catch{warning='Saved, but the bot could not refresh the posted sticky. Check channel permissions.';}
      }else warning='Saved. The bot will post on its next sticky refresh; install the runtime refresh hook for immediate posting.';
      return {ok:true,warning,entries:Object.entries(g.stickyMessages).map(([key,entry])=>({key,...entry}))};
    }
    if(action==='roleicon.set'||action==='roleicon.remove'){
      if(!owner&&!member.permissions.has(268435456n))throw fail('Manage Roles permission is required.',403);
      if(!id(request.roleId))throw fail('Choose a valid role.');
      const role=guild.roles.cache.get(request.roleId),me=guild.members.me||await guild.members.fetchMe();
      if(!me.permissions.has(268435456n))throw fail('Bot needs Manage Roles.',403);
      if(!role||role.id===guildId||role.managed||!role.editable||role.position>=me.roles.highest.position||(!owner&&role.position>=member.roles.highest.position))throw fail('Role hierarchy blocks this change.',403);
      if(!guild.features.includes('ROLE_ICONS'))throw fail('This server does not support role icons.');
      if(action==='roleicon.remove'&&request.confirm!==true)throw fail('Confirm icon removal.');
      const image=action==='roleicon.set'?decodeIcon(request.image):null;
      await role.setIcon(image,`Website role icon change by ${actorId}`);
      return {ok:true,role:{id:role.id,name:role.name,icon:role.iconURL?.()||null}};
    }
    throw fail('This action is not implemented by the website bridge.',400);
  }
  return (guildId,request,actorId)=>{
    const previous=locks.get(guildId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(()=>perform(guildId,request,actorId));
    locks.set(guildId,next);next.finally(()=>{if(locks.get(guildId)===next)locks.delete(guildId)}).catch(()=>{});return next;
  };
}
module.exports={createDashboardActions,decodeIcon};
