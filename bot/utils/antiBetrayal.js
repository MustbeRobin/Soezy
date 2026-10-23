"use strict";
const { AuditLogEvent: A, PermissionFlagsBits: P } = require('discord.js');
const EVENTS = Object.freeze({ bans:A.MemberBanAdd, kicks:A.MemberKick, timeouts:A.MemberUpdate, roleRemoval:A.MemberRoleUpdate, dangerousRoles:A.MemberRoleUpdate, channelDelete:A.ChannelDelete, channelCreate:A.ChannelCreate, roleDelete:A.RoleDelete, rolePermissions:A.RoleUpdate, serverSecurity:A.GuildUpdate, webhookCreate:A.WebhookCreate, webhookDelete:A.WebhookDelete, integrationUpdate:A.IntegrationUpdate, securityRules:A.AutoModerationRuleUpdate });
const RESPONSES = ['log','warn','timeout','removeRoles','kick','ban'];
const id = v => typeof v === 'string' && /^\d{17,20}$/.test(v);
const fail = (message,status=400) => Object.assign(new Error(message),{status});
const defaults = () => ({enabled:false,mode:'monitor',cooldownSeconds:300,timeoutSeconds:600,alertChannel:'',notifyOwner:false,logDetections:true,includeIds:true,criticalRoles:[],responseRoles:[],events:Object.fromEntries(Object.keys(EVENTS).map(k=>[k,{enabled:true,threshold:3,strictThreshold:2,minTargets:2,windowSeconds:60,response:'log'}]))});
function read(g) { const raw=g.wallSystem?.antiBetrayal||{}, d=defaults(); return {...d,...raw,events:Object.fromEntries(Object.keys(EVENTS).map(k=>[k,{...d.events[k],...raw.events?.[k]}]))}; }
function validate(raw, { roleLimit = 100, existing = defaults() } = {}) {
  const d=defaults(); if(!raw||typeof raw!=='object'||Array.isArray(raw))throw fail('Invalid Anti-Betrayal settings.');
  if(Object.keys(raw).some(k=>!Object.hasOwn(d,k)))throw fail('Unknown Anti-Betrayal setting.');
  const c={...d,...raw};
  for(const k of ['enabled','notifyOwner','logDetections','includeIds'])if(typeof c[k]!=='boolean')throw fail('Invalid '+k);
  if(!['monitor','balanced','strict'].includes(c.mode))throw fail('Invalid detection mode.');
  for(const k of ['cooldownSeconds','timeoutSeconds'])if(!Number.isInteger(c[k])||c[k]<10||c[k]>(k==='timeoutSeconds'?2419200:3600))throw fail('Invalid '+k);
  if(c.alertChannel!==''&&!id(c.alertChannel))throw fail('Invalid alert channel.');
  for(const k of ['criticalRoles','responseRoles']) {
    if(!Array.isArray(c[k])||c[k].length>100||c[k].some(x=>!id(x)))throw fail('Invalid '+k);
    c[k]=[...new Set(c[k])];
    const old = new Set(Array.isArray(existing?.[k]) ? existing[k].map(String) : []);
    if(c[k].length>roleLimit&&c[k].some(value=>!old.has(value)))throw fail(`${k==='criticalRoles'?'Critical':'Response'} roles are limited to ${roleLimit>=100?'100':roleLimit} on the current premium plan. Remove entries or upgrade to add more.` ,403);
  }
  if(!c.events||Object.keys(c.events).some(k=>!Object.hasOwn(EVENTS,k)))throw fail('Unknown event.');
  c.events=Object.fromEntries(Object.keys(EVENTS).map(k=>{
    const e={...d.events[k],...c.events[k]};
    if(Object.keys(e).some(key=>!Object.hasOwn(d.events[k],key))||typeof e.enabled!=='boolean'||!RESPONSES.includes(e.response))throw fail('Invalid event settings.');
    for(const key of ['threshold','strictThreshold','minTargets'])if(!Number.isInteger(e[key])||e[key]<(key==='minTargets'?1:2)||e[key]>100)throw fail('Event counts must be 2–100.');
    if(!Number.isInteger(e.windowSeconds)||e.windowSeconds<10||e.windowSeconds>3600)throw fail('Event window must be 10–3600 seconds.');
    return [k,e];
  })); return c;
}
function createAntiBetrayal({getClient,getDatabase,save,authorize,getRoleLimit=()=>100,now=Date.now}) {
  const queues=new Map(), windows=new Map();
  function serial(gid,fn) {const next=(queues.get(gid)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(gid,next);next.finally(()=>{if(queues.get(gid)===next)queues.delete(gid)}).catch(()=>{});return next;}
  const guildState=gid=>{const g=getDatabase().guilds?.[gid];if(!g)throw fail('Server configuration unavailable.',503);return g;};
  async function commit(gid,fn) {
    const g=guildState(gid), oldWall=Object.fromEntries(Object.entries(g.wallSystem||{}).filter(([k])=>k.startsWith('antiBetrayal')).map(([k,v])=>[k,structuredClone(v)]));
    try { fn(g); if(await save(gid)===false)throw fail('Database save failed.',503); }
    catch(e){g.wallSystem||={};for(const k of Object.keys(g.wallSystem))if(k.startsWith('antiBetrayal'))delete g.wallSystem[k];Object.assign(g.wallSystem,oldWall);throw e;}
  }
  function view(gid,actor=null) {const g=guildState(gid);return {ok:true,guildId:gid,revision:g.wallSystem?.antiBetrayalRevision||0,config:read(g),limits:{roleEntries:getRoleLimit(getDatabase(),actor,gid)},protection:{serverOwnerImmune:true,extraOwnersImmune:false},incidents:(g.wallSystem?.antiBetrayalIncidents||[]).slice(-30).map(({exemptions,...incident})=>incident)};}
  async function action(gid,req,actor) {return serial(gid,async()=>{
    if(!id(gid)||!id(actor)||!await authorize(gid,actor))throw fail('Only the bot owner or an authorized extra owner may configure Anti-Betrayal.',403);
    if(!req||typeof req!=='object'||Array.isArray(req))throw fail('Invalid Anti-Betrayal action.');
    if(req.action==='antiBetrayal.get')return view(gid,actor);
    if(req.action!=='antiBetrayal.set')throw fail('Unknown Anti-Betrayal action.');
    if(Object.hasOwn(req,'exemptions'))throw fail('Anti-Betrayal has no user or role whitelist. Only the server owner is immune.');
    const g=guildState(gid), previous=view(gid,actor);
    if(req.revision!==previous.revision)throw fail('Settings changed. Reload before saving.',409);
    const c=validate(req.config||previous.config,{roleLimit:previous.limits.roleEntries,existing:previous.config});
    const guild=getClient().guilds.cache.get(gid);if(!guild)throw fail('Bot is not in this server.',404);
    for(const rid of [...new Set([...c.criticalRoles,...c.responseRoles])])if(!await guild.roles.fetch(rid).catch(()=>null))throw fail('Selected role is not in this server.');
    if(c.alertChannel&&!await guild.channels.fetch(c.alertChannel).catch(()=>null))throw fail('Alert channel is not in this server.');
    if(!await authorize(gid,actor))throw fail('Anti-Betrayal configuration permission was revoked.',403);
    await commit(gid,g=>{g.wallSystem||={};g.wallSystem.antiBetrayal=c;g.wallSystem.antiBetrayalRevision=previous.revision+1;g.wallSystem.antiBetrayalIncidents=[...(g.wallSystem.antiBetrayalIncidents||[]),{id:'config:'+now(),kind:'configuration',actorId:actor,at:now(),revision:previous.revision+1}].slice(-100);});
    for(const key of windows.keys())if(key.startsWith(gid+':'))windows.delete(key);
    return {...view(gid,actor),applied:true};
  });}
  async function record(gid,incident){await commit(gid,g=>{g.wallSystem||={};g.wallSystem.antiBetrayalIncidents=[...(g.wallSystem.antiBetrayalIncidents||[]),incident].slice(-100);});}
  function eventMatches(key,entry,c,guild){
    const changes=entry.changes||[];
    if(key==='timeouts')return changes.some(x=>x.key==='communication_disabled_until'&&x.new&&Date.parse(x.new)>now());
    if(key==='roleRemoval')return changes.some(x=>x.key==='$remove'&&x.new?.some(r=>c.criticalRoles.includes(r.id)));
    if(key==='dangerousRoles')return changes.some(x=>x.key==='$add'&&x.new?.some(r=>guild.roles.cache.get(r.id)?.permissions?.any([P.Administrator,P.ManageGuild,P.ManageRoles,P.BanMembers,P.KickMembers])));
    if(key==='rolePermissions')return changes.some(x=>x.key==='permissions'&&x.new!==x.old);
    if(key==='serverSecurity')return changes.some(x=>['verification_level','explicit_content_filter','mfa_level','default_message_notifications'].includes(x.key));
    return true;
  }
  async function alert(guild,c,incident){
    if(!c.alertChannel&&!c.notifyOwner)return;
    const body={embeds:[{title:'Soezy · Anti-Betrayal',color:0xce3d60,description:`Event: ${incident.kind}\nCount: ${incident.count||0} / ${incident.threshold||0}\nMode: ${c.mode}\nResult: ${incident.result}\nIncident: ${incident.id}`+(c.includeIds?`\nActor: ${incident.actorId||'Unknown'}\nTarget: ${incident.targetId||'Unknown'}`:''),timestamp:new Date(now()).toISOString()}],allowedMentions:{parse:[]}};
    const failures=[];
    if(c.alertChannel)try {const ch=await guild.channels.fetch(c.alertChannel);if(!ch?.isTextBased?.())throw Error('Channel unavailable');await ch.send(body);}catch{failures.push('alert-channel-unavailable');}
    if(c.notifyOwner)try{await (await guild.fetchOwner()).send(body);}catch{failures.push('owner-notification-unavailable');}
    if(failures.length)await record(guild.id,{...incident,id:incident.id+':notification',result:failures.join(', ')});
  }
  async function consume(entry,guild){return serial(guild.id,async()=>{
    const g=guildState(guild.id), c=read(g);if(!c.enabled)return;
    const at=now(), timestamp=Number(entry.createdTimestamp), actorId=entry.executorId||entry.executor?.id, targetId=entry.targetId||entry.target?.id;
    if(!id(entry.id)||!Object.values(EVENTS).includes(entry.action))return;
    if(!id(actorId)||!id(targetId)||!Number.isFinite(timestamp)||at-timestamp>120000||timestamp>at+5000){
      if(!(g.wallSystem?.antiBetrayalIncidents||[]).some(x=>x.id===entry.id))await record(guild.id,{id:entry.id,kind:'uncertain-attribution',at,result:'No response; missing or stale audit evidence'});
      return;
    }
    if((g.wallSystem?.antiBetrayalSeen||[]).includes(entry.id))return;
    const kinds=Object.keys(EVENTS).filter(k=>EVENTS[k]===entry.action&&c.events[k].enabled&&eventMatches(k,entry,c,guild));if(!kinds.length)return;
    if(actorId===guild.ownerId){
      await commit(guild.id,g=>{g.wallSystem||={};g.wallSystem.antiBetrayalSeen=[...(g.wallSystem.antiBetrayalSeen||[]),entry.id].slice(-1000);});
      if(c.logDetections)await record(guild.id,{id:entry.id,kind:kinds[0],actorId,targetId,at,result:'server-owner immunity'});
      return;
    }
    if(actorId===getClient().user.id)return;
    // Force a current membership lookup. Unavailable roles never imply non-exemption.
    let member=await guild.members.fetch({user:actorId,force:true}).catch(()=>null);
    if(!member){await record(guild.id,{id:entry.id,kind:kinds[0],actorId,targetId,at,result:'uncertain-member; no response'});return;}
    await commit(guild.id,g=>{g.wallSystem||={};g.wallSystem.antiBetrayalSeen=[...(g.wallSystem.antiBetrayalSeen||[]),entry.id].slice(-1000);});
    for(const kind of kinds){
      const rule=c.events[kind], key=`${guild.id}:${actorId}:${kind}`, cutoff=at-rule.windowSeconds*1000;
      for(const [key,value] of windows)if(value.at<at-3600000)windows.delete(key);
      if(windows.size>=10000&&!windows.has(key))return;
      const items=(windows.get(key)?.items||[]).filter(e=>e.at>=cutoff);if(timestamp<cutoff)continue;items.push({at:timestamp,targetId,id:entry.id});if(items.length>100)items.shift();windows.set(key,{at,items});
      const threshold=c.mode==='strict'?rule.strictThreshold:rule.threshold;
      if(items.length<threshold||new Set(items.map(x=>x.targetId)).size<rule.minTargets)continue;
      const cooldown=g.wallSystem?.antiBetrayalCooldowns?.[actorId]||0;if(cooldown&&at-cooldown<c.cooldownSeconds*1000)continue;
      const incident={id:entry.id+':'+kind,kind,actorId,targetId,at,count:items.length,threshold,evidence:items.map(x=>x.id),result:'monitor',mode:c.mode};
      // Persist reservation before any action; uncertainty never retries punishment.
      await commit(guild.id,g=>{g.wallSystem.antiBetrayalCooldowns=Object.fromEntries(Object.entries(g.wallSystem.antiBetrayalCooldowns||{}).filter(([,v])=>v>at-3600000));g.wallSystem.antiBetrayalCooldowns[actorId]=at;g.wallSystem.antiBetrayalIncidents=[...(g.wallSystem.antiBetrayalIncidents||[]),{...incident,result:'reserved; response may be pending'}].slice(-100);});
      try {
        if(c.mode!=='monitor'){
          member=await guild.members.fetch({user:actorId,force:true}).catch(()=>null);
          if(!member)throw Error('Current membership unavailable');
          if(actorId===guild.ownerId) { incident.result='Response skipped: server owner immunity'; await record(guild.id,incident);windows.delete(key);continue; }
          const reason='Soezy Anti-Betrayal '+incident.id;
          if(rule.response==='warn'){
            await member.send({embeds:[{title:'Soezy · Anti-Betrayal warning',color:0xce3d60,description:`Your recent activity in ${guild.name||'this server'} triggered an Anti-Betrayal warning. If this action was authorized, contact a server administrator.\nIncident: ${incident.id}`}],allowedMentions:{parse:[]}});
          }
          if(rule.response==='timeout'){if(!member.moderatable)throw Error('Missing timeout permission or hierarchy');await member.timeout(c.timeoutSeconds*1000,reason);}
          if(rule.response==='kick'){if(!member.kickable)throw Error('Missing kick permission or hierarchy');await member.kick(reason);}
          if(rule.response==='ban'){if(!member.bannable)throw Error('Missing ban permission or hierarchy');await member.ban({reason,deleteMessageSeconds:0});}
          if(rule.response==='removeRoles'){const roles=c.responseRoles.map(id=>member.roles.cache.get(id)).filter(Boolean);if(!member.manageable||!roles.length||roles.some(r=>!r.editable||r.managed))throw Error('Configured response roles cannot be removed');await member.roles.remove(roles,reason);}
          incident.result=rule.response==='log'?'logged':rule.response==='warn'?'warning delivered':rule.response+' applied';
        }
      } catch {incident.result='response failed; check Discord permissions and hierarchy';}
      await record(guild.id,incident);await alert(guild,c,incident);windows.delete(key);
    }
  });}
  return {action,consume,view};
}
module.exports={createAntiBetrayal,defaults,validate,EVENTS};
