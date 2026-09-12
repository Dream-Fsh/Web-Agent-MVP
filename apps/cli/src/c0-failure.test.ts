import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildWorkflow} from '@web-agent/workflow-builder';
import {parseWorkflow} from '@web-agent/protocol';
it.each([0,1])('real CLI preserves clean failure evidence for legacy C0 %i credentials',async code=>{
 const root=await mkdtemp(join(tmpdir(),'wa-c0-cli-'));console.info('C0 CLI artifacts:',root);
 const secret='REREVIEW/URL-SECRET',encoded=encodeURIComponent(secret);
 const workflow=buildWorkflow([],[],{id:'legacy',name:'query',sessionId:'s',startUrl:'http://127.0.0.1:9/rta',createdAt:new Date().toISOString()});
 // Deliberate old-format INPUT: bypass the new writer, not the production run or evidence paths.
 workflow.startUrl=String.fromCharCode(code)+`http://demo:${encoded}@127.0.0.1:9/rta`;
 workflow.steps=[{id:'nav',type:'navigate',url:workflow.startUrl},{id:'extract',type:'extract',target:{fingerprint:{tag:'table'},locators:[{strategy:'css',value:'table',score:1}]},parameters:{operation:'extractCount',key:'count'}}];
 workflow.steps[0].parameters={legacyAttributes:Array.from({length:32},(_,n)=>{
  const value=' '+String.fromCharCode(n)+`//demo:${encoded}@fixture.test/rta`;
  return {href:value,src:value,action:value,formaction:value};
 })};
 const input=join(root,'workflows/legacy');await mkdir(input,{recursive:true});
 await writeFile(join(input,'v1.json'),JSON.stringify(parseWorkflow(workflow)));
 await writeFile(join(input,'current.json'),JSON.stringify({currentVersion:1}));
 const result=await new Promise<{code:number|null;out:string}>((resolveResult,reject)=>{
  const child=spawn(process.execPath,[resolve('../../apps/cli/dist/bin.js'),'run','legacy','--root',root,'--headless','--json']);
  let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);child.once('error',reject);child.once('close',code=>resolveResult({code,out}));
 });
 await writeFile(join(root,'cli-output.txt'),result.out);
 expect(result.code).toBe(2);const run=JSON.parse(result.out);expect(run.status).toBe('blocked');expect(run.outputs).toEqual({});expect(run.steps).toHaveLength(1);expect(run.steps[0].id).not.toBe('extract');
 const directory=join(root,'data/failures',run.runId,run.steps[0].id);
 // Require the actual snapshot, not merely a helper result or an absent file.
 const snapshot=JSON.parse(await readFile(join(directory,'workflow.snapshot.json'),'utf8'));
 expect(snapshot.startUrl).toBe('http://127.0.0.1:9/rta');
 let files=0;
 async function scan(dir:string):Promise<void>{for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);if(entry.isDirectory())await scan(path);else{files++;const text=await readFile(path,'utf8');for(const marker of [secret,encoded,encodeURIComponent(encoded)])expect(text.toLowerCase(),path).not.toContain(marker.toLowerCase());}
 }}
 // The deliberately secret-bearing legacy v1 is input evidence, never claimed clean.
 await scan(join(root,'data/failures'));await scan(join(root,'data/runs'));expect(files).toBeGreaterThanOrEqual(6);
 for(const marker of [secret,encoded])expect(result.out).not.toContain(marker);
},25000);
