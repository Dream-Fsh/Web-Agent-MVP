import {promises as fs} from 'node:fs';
import {dirname,join} from 'node:path';

interface Owner {id:string;pid:number;startedAt:number;heartbeatAt:number;timeoutMs:number;sessionId?:string}
interface LeaseOptions {now?:()=>number;heartbeatMs?:number;timeoutMs?:number}
interface RecoveryOptions {now?:()=>number;isProcessAlive?:(pid:number)=>boolean}
export interface LeaseRecovery {status:'absent'|'active'|'recent'|'abandoned'|'already-recovered';path:string;ownerPid?:number;archive?:string}
function alive(pid:number):boolean {try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=='ESRCH';}}
async function ownerAt(path:string):Promise<Owner>{
  const owner=JSON.parse(await fs.readFile(join(path,'owner.json'),'utf8')) as Owner;
  if(!/^[a-f0-9-]{36}$/.test(owner.id)||!Number.isSafeInteger(owner.pid)||owner.pid<1||!Number.isFinite(owner.heartbeatAt)||!Number.isFinite(owner.timeoutMs)||owner.timeoutMs<1)throw new Error('Invalid lock owner; refusing automatic recovery');
  return owner;
}
async function atomicOwner(path:string,owner:Owner){
  const temp=join(path,`.heartbeat-${crypto.randomUUID()}.tmp`);
  try{await fs.writeFile(temp,JSON.stringify(owner)+'\n',{flag:'wx'});await fs.rename(temp,join(path,'owner.json'));}
  finally{await fs.rm(temp,{force:true});}
}
/** A nonempty lock directory makes rename-to-history create-only across recoverers. */
export async function acquirePersistenceLease(path:string,options:LeaseOptions={}){
  const now=options.now??Date.now;const timeoutMs=options.timeoutMs??30000;
  if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw new Error('Invalid lease timeout');
  const owner:Owner={id:crypto.randomUUID(),pid:process.pid,startedAt:now(),heartbeatAt:now(),timeoutMs};
  await fs.mkdir(dirname(path),{recursive:true});
  const staged=path+'.staged-'+owner.id;await fs.mkdir(staged);
  try{await atomicOwner(staged,owner);await fs.rename(staged,path);}catch(error){await fs.rm(staged,{recursive:true,force:true});throw error;}
  let closed=false;let queue:Promise<void>=Promise.resolve();let heartbeatError:unknown;
  async function checkOwner(){if((await ownerAt(path)).id!==owner.id)throw new Error('Lock owner changed');}
  function heartbeat(sessionId?:string):Promise<void>{
    if(closed)return Promise.reject(new Error('Lock owner is closed'));
    if(sessionId!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionId))return Promise.reject(new Error('Invalid session id'));
    const operation=queue.then(async()=>{await checkOwner();owner.heartbeatAt=now();if(sessionId!==undefined)owner.sessionId=sessionId;await atomicOwner(path,owner);});
    queue=operation.catch(error=>{heartbeatError=error;});return operation;
  }
  const heartbeatMs=options.heartbeatMs??1000;
  const timer=heartbeatMs>0?setInterval(()=>{void heartbeat().catch(()=>{});},heartbeatMs):undefined;timer?.unref();
  return {id:owner.id,heartbeat,async assertOwned(){await queue;if(heartbeatError)throw heartbeatError;await checkOwner();},async close(){
    if(closed)return;closed=true;if(timer)clearInterval(timer);await queue;await checkOwner();
    const history=path+'.history';await fs.mkdir(history,{recursive:true});const archive=join(history,owner.id+'.closed');
    await fs.writeFile(join(path,'recovery.json'),JSON.stringify({status:'closed',ownerPid:owner.pid,at:now()})+'\n',{flag:'wx'});await fs.rename(path,archive);
  }};
}
/** Timeout alone never evicts a live process; abandoned locks remain auditable. */
export async function recoverPersistenceLease(path:string,options:RecoveryOptions={}):Promise<LeaseRecovery>{
  let owner:Owner;
  try{owner=await ownerAt(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {status:'absent',path};throw error;}
  const base={path,ownerPid:owner.pid};const now=(options.now??Date.now)();
  if((options.isProcessAlive??alive)(owner.pid))return {...base,status:'active'};
  if(now-owner.heartbeatAt<owner.timeoutMs)return {...base,status:'recent'};
  const history=path+'.history';await fs.mkdir(history,{recursive:true});const archive=join(history,owner.id+'.abandoned');
  const auditDirectory=path+'.audit';await fs.mkdir(auditDirectory,{recursive:true});const auditPath=join(auditDirectory,owner.id+'.abandoned.json');

  try{await fs.writeFile(auditPath,JSON.stringify({status:'abandoned',ownerPid:owner.pid,heartbeatAt:owner.heartbeatAt,recoveredBy:process.pid,at:now})+'\n',{flag:'wx'});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  // Every contender for this owner uses the same nonempty destination. A second
  // rename cannot replace that archive, even if a new owner acquired path.
  try{await fs.rename(path,archive);}catch(error){if(['ENOENT','EEXIST','ENOTEMPTY','EPERM'].includes((error as NodeJS.ErrnoException).code??'')){
    try{if((await ownerAt(archive)).id===owner.id)return {...base,status:'already-recovered',archive};}catch{}
  }throw error;}

  try{await fs.link(auditPath,join(archive,'recovery.json'));}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return {...base,status:'already-recovered',archive};throw error;}
  return {...base,status:'abandoned',archive};
}
