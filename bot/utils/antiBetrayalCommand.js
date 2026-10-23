"use strict";
async function antiBetrayalCommand(service, msg, args) {
  const actor=msg.author.id, gid=msg.guildId;
  const current=await service.action(gid,{action:'antiBetrayal.get'},actor);
  const [operation='status',...rest]=args;
  if(['status','config','incidents'].includes(operation)){
    const payload=operation==='incidents'?current.incidents.slice(-5):operation==='status'?{guildId:gid,enabled:current.config.enabled,mode:current.config.mode,protection:current.protection}:{guildId:gid,revision:current.revision,config:current.config,protection:current.protection};
    return msg.reply({content:'```json\n'+JSON.stringify(payload,null,2).slice(0,1850)+'\n```',allowedMentions:{parse:[]}});
  }
  if(operation==='enable'||operation==='disable')current.config.enabled=operation==='enable';
  else if(operation==='mode')current.config.mode=rest[0];
  else throw Error('Use: wall antibetrayal status|config|incidents|enable|disable|mode monitor|balanced|strict. Only the server owner is immune; Anti-Betrayal has no user or role whitelist.');
  const result=await service.action(gid,{action:'antiBetrayal.set',revision:current.revision,config:current.config},actor);
  return msg.reply({content:`Anti-Betrayal saved and applied. Revision ${result.revision}.`,allowedMentions:{parse:[]}});
}
module.exports={antiBetrayalCommand};
