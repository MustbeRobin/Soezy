'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createDashboardActions} = require('../utils/dashboardActions');
const {modules} = require('../utils/dashboardCommunity');
const gid='100000000000000001', uid='100000000000000002', channelId='100000000000000003', roleId='100000000000000004';
function fixture() {
  let saves=0, failSave=false;const refreshed=[];
  const g={goodbye:{enabled:false,channel:channelId,message:'Old',privateValue:'preserved'},confession:{confessions:[{content:'private'}],bannedUsers:[]}};
  const db={guilds:{[gid]:g},guildSystems:{[gid]:{goodbye:false}}};
  const permissions={has:()=>true};
  const member={id:uid,permissions,roles:{highest:{position:50}}};
  const channel={id:channelId,name:'general',type:0,isTextBased:()=>true,isThread:()=>false,permissionsFor:()=>permissions};
  const role={id:roleId,name:'birthday',editable:true,managed:false,position:2,permissions:{has:()=>false}};
  const guild={id:gid,ownerId:uid,features:[],members:{me:{permissions,roles:{highest:{position:100}}},cache:new Map([[uid,member]]),fetch:async()=>null},channels:{cache:new Map([[channelId,channel]]),fetch:async()=>null},roles:{cache:new Map([[roleId,role]]),fetch:async()=>null}};
  const client={guilds:{cache:new Map([[gid,guild]])}};
  const action=createDashboardActions({getClient:()=>client,loadDatabase:()=>db,saveDatabase:async()=>{saves++;if(failSave)throw Error('secret connection string');},onCommunityUpdated:async(guildId,module)=>refreshed.push([guildId,module])});
  const call=(request,actor=uid,server=gid)=>action(server,request,actor);
  const read=module=>call({action:'community.get',module});
  const write=async(module,values)=>call({action:'community.set',module,revision:(await read(module)).revision,values});
  return {g,db,guild,member,channel,role,call,read,write,refreshed,get saves(){return saves;},fail:()=>failSave=true};
}
test('every added module has a readable schema without leaking private data',async()=>{
  const f=fixture();
  for(const module of Object.keys(modules)){const result=await f.read(module);assert.equal(result.ok,true);assert.equal(result.module,module);assert.match(result.revision,/^[a-f0-9]{64}$/);}
  assert.doesNotMatch(JSON.stringify(await f.read('confess')),/private|confessions/);
});
test('module enable, partial edits and disable persist to the shared bot stores',async()=>{
  const f=fixture();await f.write('goodbye',{enabled:true,message:'Goodbye {user}'});
  assert.equal(f.g.goodbye.enabled,true);assert.equal(f.g.features.goodbye,true);assert.equal(f.db.guildSystems[gid].goodbye,true);
  assert.equal(f.g.goodbye.privateValue,'preserved');assert.equal(f.g.goodbye.channel,channelId);
  assert.equal((await f.read('goodbye')).values.message,'Goodbye {user}');
  await f.write('goodbye',{enabled:false});assert.equal((await f.read('goodbye')).values.enabled,false);assert.equal(f.saves,2);
});
test('invalid patches are atomic and unknown modules/fields are rejected',async()=>{
  const f=fixture();const before=JSON.stringify(f.db);
  await assert.rejects(f.write('goodbye',{message:'Changed',enabled:'yes'}),/on or off/);
  await assert.rejects(f.write('goodbye',{'__proto__.polluted':true}),/Unknown setting/);
  await assert.rejects(f.read('__proto__'),/Unknown module/);
  assert.equal(JSON.stringify(f.db),before);assert.equal(f.saves,0);
});
test('actors without Manage Server and actors outside the server cannot read or mutate',async()=>{
  const f=fixture();f.guild.ownerId='other';f.member.permissions={has:()=>false};
  await assert.rejects(f.read('goodbye'),error=>error.status===403);
  await assert.rejects(f.call({action:'community.get',module:'goodbye'},'100000000000000099'),error=>error.status===403);
  await assert.rejects(f.call({action:'community.get',module:'goodbye'},uid,'100000000000000099'),error=>error.status===404);
  assert.equal(f.saves,0);
});
test('channel selection rejects foreign, inaccessible and wrong-type channels',async()=>{
  const f=fixture();await assert.rejects(f.write('goodbye',{channel:'100000000000000099'}),/not in this server/);
  await assert.rejects(f.write('tempvoice',{createChannel:channelId}),/channel type/);
  f.channel.permissionsFor=()=>({has:()=>false});await assert.rejects(f.write('goodbye',{channel:channelId}),error=>error.status===403);
});
test('birthday role assignment preserves hierarchy and disallows privileged roles',async()=>{
  const f=fixture();await f.write('birthday',{role:roleId});
  f.role.permissions={has:()=>true};await assert.rejects(f.write('birthday',{role:roleId}),/Privileged/);
  f.role.permissions={has:()=>false};f.role.position=101;await assert.rejects(f.write('birthday',{role:roleId}),/hierarchy/);
});
test('stale revision and concurrent editors cannot overwrite a newer save',async()=>{
  const f=fixture();const {revision}=await f.read('goodbye');
  const results=await Promise.allSettled(['First','Second'].map(message=>f.call({action:'community.set',module:'goodbye',revision,values:{message}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results[1].reason.status,409);assert.equal(f.g.goodbye.message,'First');
});
test('save failure is sanitized and restores module and feature state',async()=>{
  const f=fixture();const original=structuredClone(f.db);f.fail();
  await assert.rejects(f.write('goodbye',{enabled:true}),error=>error.status===503&&!error.message.includes('secret'));
  assert.deepEqual(f.db.guilds[gid].goodbye,original.guilds[gid].goodbye);assert.deepEqual(f.db.guildSystems,original.guildSystems);
});
test('goodbye and join-DM colors round-trip the bot numeric color format',async()=>{
  const f=fixture();f.g.goodbye.color=0x55c995;f.g.joinDm={color:0xe36b70,dmImage:'https://example.com/old.png',dmFooter:'Old footer'};
  assert.equal((await f.read('goodbye')).values.color,'#55c995');
  assert.equal((await f.read('joindm')).values.color,'#e36b70');
  assert.equal((await f.read('joindm')).values.image,'https://example.com/old.png');
  assert.equal((await f.read('joindm')).values.footer,'Old footer');
  await f.write('goodbye',{color:'#123456'});assert.equal(f.g.goodbye.color,0x123456);
});
test('confession log edits stay synchronized with supported legacy storage',async()=>{
  const f=fixture();f.g.confession.logs='100000000000000003';f.g.confessionLogs='100000000000000003';
  assert.equal((await f.read('confess')).values.logChannel,'100000000000000003');
  await f.write('confess',{logChannel:''});assert.equal(f.g.confession.logChannel,null);assert.equal(f.g.confession.logs,null);assert.equal(f.g.confessionLogs,null);
});
test('economy writes initialize source defaults before applying a partial update',async()=>{
  const f=fixture();await f.write('economy',{'work.min':75});
  assert.deepEqual(f.g.economy.work,{min:75,max:200});
  assert.equal(f.g.economy.startBalance,100);assert.equal(f.g.economy.daily,1);assert.equal(f.g.economy.currency,'💰');
});
test('trigger refresh failures report a warning without undoing a confirmed save',async()=>{
  const f=fixture();
  const action=createDashboardActions({getClient:()=>({guilds:{cache:new Map([[gid,f.guild]])}}),loadDatabase:()=>f.db,saveDatabase:async()=>{},onCommunityUpdated:async()=>{throw Error('refresh failed');}});
  const result=await action(gid,{module:'autoresponder',action:'community.upsert',revision:(await f.read('autoresponder')).revision,trigger:'hello',response:'Hi',reactions:[],enabled:true},uid);
  assert.equal(result.ok,true);assert.match(result.warning,/in-memory trigger matcher/);assert.equal(f.g.autoresponder.triggers.hello.response,'Hi');
});
test('message validation blocks mass mentions, unsafe URLs, oversized values and incomplete enable',async()=>{
  const f=fixture();
  await assert.rejects(f.write('goodbye',{message:'@everyone hello'}),/Mass mentions/);
  await assert.rejects(f.write('goodbye',{image:'javascript:alert(1)'}),/HTTPS/);
  await assert.rejects(f.write('goodbye',{title:'a'.repeat(257)}),/Invalid/);
  await assert.rejects(f.write('joindm',{enabled:true}),/Enter a message/);
  await assert.rejects(f.write('media',{enabled:true}),/at least one/);
  await assert.rejects(f.write('tempvoice',{enabled:true}),/category/);
  await assert.rejects(f.write('economy',{'work.min':10,'work.max':5}),/Minimum/);
});
test('clearing join DM image/footer also clears legacy fallbacks',async()=>{
  const f=fixture();f.g.joinDm={image:'https://example.com/a.png',dmImage:'https://example.com/b.png',footer:'Old',dmFooter:'Old'};
  await f.write('joindm',{image:'',footer:''});assert.equal(f.g.joinDm.dmImage,'');assert.equal(f.g.joinDm.dmFooter,'');
});
for(const module of ['autoresponder','autoreact'])test(`${module} rules create/edit/disable/delete/clear without resetting other config`,async()=>{
  const f=fixture();
  const save=async(trigger,extra={})=>f.call({module,action:'community.upsert',revision:(await f.read(module)).revision,trigger,response:'Hello',emojis:['😀'],reactions:[],enabled:true,...extra});
  await save('Hello');assert.equal((await f.read(module)).entries.length,1);
  assert.deepEqual(f.refreshed.at(-1),[gid,module]);
  await assert.rejects(save('HELLO'),/already exists/);
  await save('Greeting',{originalKey:'hello',enabled:false});const data=await f.read(module);assert.equal(data.entries[0].enabled,false);assert.equal(data.entries[0].key,'greeting');
  await assert.rejects(f.call({module,action:'community.delete',revision:data.revision,trigger:'greeting'}),/confirm/);
  await f.call({module,action:'community.delete',revision:data.revision,trigger:'greeting',confirm:true});assert.equal((await f.read(module)).entries.length,0);
  await save('One');await save('Two',{response:'Different'});
  await f.call({module,action:'community.clear',revision:(await f.read(module)).revision,confirm:true});assert.equal((await f.read(module)).entries.length,0);
  assert.equal(f.g.goodbye.privateValue,'preserved');
});
test('trigger prototype keys and malformed emoji are rejected without writes',async()=>{
  const f=fixture();const revision=(await f.read('autoreact')).revision;
  for(const trigger of ['__proto__','constructor','prototype',''])await assert.rejects(f.call({module:'autoreact',action:'community.upsert',revision,trigger,emojis:['😀'],enabled:true}));
  await assert.rejects(f.call({module:'autoreact',action:'community.upsert',revision,trigger:'ok',emojis:['not-emoji'],enabled:true}),/valid emoji/);assert.equal(f.saves,0);
});
test('bulk roles require a fresh confirmed preview and report per-member outcomes',async()=>{
  const f=fixture();const tid='100000000000000005';let additions=0;
  const target={id:tid,displayName:'Test member',roles:{highest:{position:1},cache:new Map(),add:async()=>{additions++;},remove:async()=>{}}};
  f.guild.members.fetch=async id=>id===tid?target:null;
  const payload={module:'rolebulk',operation:'add',roleId,memberIds:[tid]};
  const plan=await f.call({...payload,action:'community.rolePreview'});assert.equal(additions,0);
  await assert.rejects(f.call({...payload,action:'community.roleApply',revision:plan.revision}),error=>error.status===409);
  const result=await f.call({...payload,action:'community.roleApply',revision:plan.revision,confirm:true});assert.equal(additions,1);assert.equal(result.outcomes[0].state,'applied');
  target.roles.cache.set(roleId,{});
  await assert.rejects(f.call({...payload,action:'community.roleApply',revision:plan.revision,confirm:true}),error=>error.status===409);
  f.role.permissions.has=()=>true;await assert.rejects(f.call({...payload,action:'community.rolePreview'}),/Privileged/);
});
