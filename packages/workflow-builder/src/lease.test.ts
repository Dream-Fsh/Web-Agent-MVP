import {promises as fs} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as persistence from './persistence.js';

it('keeps an active lease exclusive and advances heartbeat without recording secrets',async()=>{
  expect(persistence).toHaveProperty('acquirePersistenceLease');
  const root=await mkdtemp(join(tmpdir(),'lease-'));let now=1000;
  try{
    const path=join(root,'recording.lock');const lease=await persistence.acquirePersistenceLease(path,{now:()=>now,heartbeatMs:0,timeoutMs:500});
    await expect(persistence.acquirePersistenceLease(path)).rejects.toThrow();
    now=1200;await lease.heartbeat();
    const owner=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));
    expect(owner.heartbeatAt).toBe(1200);expect(owner.pid).toBe(process.pid);
    expect(await persistence.recoverPersistenceLease(path,{now:()=>2000,isProcessAlive:()=>true})).toMatchObject({status:'active'});
    await lease.close();
    expect(await readdir(path+'.history')).toHaveLength(1);
    const next=await persistence.acquirePersistenceLease(path,{heartbeatMs:0});await next.close();
  }finally{await rm(root,{recursive:true,force:true});}
});
it('archives timed-out dead owners as abandoned and preserves a recovery log before allowing a new lease',async()=>{
  expect(persistence).toHaveProperty('recoverPersistenceLease');
  const root=await mkdtemp(join(tmpdir(),'recover-'));const path=join(root,'recording.lock');
  try{
    const lease=await persistence.acquirePersistenceLease(path,{now:()=>1000,heartbeatMs:0,timeoutMs:500});
    expect(await persistence.recoverPersistenceLease(path,{now:()=>1200,isProcessAlive:()=>false})).toMatchObject({status:'recent'});
    const results=await Promise.all([persistence.recoverPersistenceLease(path,{now:()=>2000,isProcessAlive:()=>false}),persistence.recoverPersistenceLease(path,{now:()=>2000,isProcessAlive:()=>false})]);
    expect(results.filter(result=>result.status==='abandoned')).toHaveLength(1);
    const entries=await readdir(path+'.history');expect(entries).toHaveLength(1);
    expect(JSON.parse(await readFile(join(path+'.history',entries[0],'recovery.json'),'utf8'))).toMatchObject({status:'abandoned',ownerPid:process.pid});
    const next=await persistence.acquirePersistenceLease(path,{heartbeatMs:0});
    await expect(lease.heartbeat()).rejects.toThrow(/owner/i);
    await next.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

it('writes the recovery audit before releasing the lock even if archiving is interrupted',async()=>{
  const root=await mkdtemp(join(tmpdir(),'recover-interrupt-'));const path=join(root,'recording.lock');
  try{
    const lease=await persistence.acquirePersistenceLease(path,{now:()=>1000,heartbeatMs:0,timeoutMs:500});
    const original=fs.rename;const rename=vi.spyOn(fs,'rename').mockImplementation(async(from,to)=>{
      if(String(to).endsWith('.abandoned'))throw new Error('interrupted archive');return original(from,to);
    });
    try{await expect(persistence.recoverPersistenceLease(path,{now:()=>2000,isProcessAlive:()=>false})).rejects.toThrow('interrupted');}
    finally{rename.mockRestore();}
    expect(JSON.parse(await readFile(join(path+'.audit',lease.id+'.abandoned.json'),'utf8'))).toMatchObject({status:'abandoned'});
  }finally{await rm(root,{recursive:true,force:true});}
});
