import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('CLI recovers a genuinely terminated recording service only after heartbeat timeout and preserves its audit',async()=>{
  const root=await mkdtemp(join(tmpdir(),'recording-recovery-e2e-'));
  const children:ChildProcess[]=[];
  function service(){
    const script=`import {startRecordingService} from ${JSON.stringify(pathToFileURL(resolve('apps/recording-service/dist/index.js')).href)};const service=await startRecordingService({root:${JSON.stringify(root)},leaseOptions:{heartbeatMs:50,timeoutMs:200}});console.log('ready');`;
    const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});children.push(child);let output='';child.stdout.on('data',chunk=>output+=chunk);
    const done=new Promise<number|null>(resolve=>child.once('close',resolve));return {child,done,output:()=>output};
  }
  async function recover(){
    const child=spawn(process.execPath,[resolve('apps/cli/bin/web-agent.mjs'),'recording','recover','--root',root],{stdio:['ignore','pipe','pipe']});children.push(child);let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const code=await new Promise<number|null>(resolve=>child.once('close',resolve));expect(code,output).toBe(0);return output;
  }
  try{
    const first=service();await expect.poll(first.output).toContain('ready');
    const path=join(root,'data/recording.lock');const initial=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));
    await expect.poll(async()=>JSON.parse(await readFile(join(path,'owner.json'),'utf8')).heartbeatAt).toBeGreaterThan(initial.heartbeatAt);
    expect(await recover()).toContain('active');
    first.child.kill('SIGKILL');await first.done;
    await expect.poll(recover,{timeout:10000}).toContain('abandoned');
    const history=await readdir(path+'.history');expect(history).toHaveLength(1);
    expect(JSON.parse(await readFile(join(path+'.history',history[0],'recovery.json'),'utf8'))).toMatchObject({status:'abandoned',ownerPid:initial.pid});
    const next=service();await expect.poll(next.output).toContain('ready');
    next.child.kill('SIGKILL');await next.done;
  }finally{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
});

test('terminating the CLI also disconnects its automation browser before profile recovery',async()=>{
  const {chromium}=await import('@playwright/test');const {createServer}=await import('node:http');
  const root=await mkdtemp(join(tmpdir(),'profile-crash-e2e-'));
  const portServer=createServer();await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));const address=portServer.address();if(!address||typeof address==='string')throw new Error('No address');await new Promise<void>(resolve=>portServer.close(()=>resolve()));
  const child=spawn(process.execPath,[resolve('apps/cli/bin/web-agent.mjs'),'login','--headless','--cdp-port',String(address.port),'--root',root],{stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);const done=new Promise<number|null>(resolve=>child.once('close',resolve));
  let browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined;
  try{
    await expect.poll(()=>output,{timeout:15000}).toContain('Login session ready');
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`);
    child.kill('SIGKILL');await done;
    await expect.poll(()=>browser!.isConnected(),{timeout:10000}).toBe(false);
    const owner=JSON.parse(await readFile(join(root,'data/browser-profile.lock/owner.json'),'utf8'));expect(owner.pid).toBe(child.pid);
  }finally{if(browser?.isConnected()){const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});}if(child.exitCode===null)child.kill('SIGKILL');await done;await rm(root,{recursive:true,force:true});}
});
