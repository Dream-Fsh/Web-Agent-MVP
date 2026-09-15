import {expect,it} from 'vitest';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistRawRecording} from '@web-agent/recording-adapter';
import {saveFailurePackage} from '@web-agent/failure';
import {parseWorkflow,parseRawEvent} from '@web-agent/protocol';
import {normalizeEvents} from '@web-agent/normalizer';
import {buildWorkflow} from './index.js';
import {saveWorkflow} from './persistence.js';
it('reads clean free text from actual recording, legacy Workflow and failure snapshot writers',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wa-text-persistence-'));console.info('Text persistence artifacts:',root);
 const secret='REREVIEW%2FURL-SECRET',url=`http://demo:${secret}@127.0.0.1:9/rta`;
 const values=[`\u0000[${url}](${url})`,`\u0001//demo:${secret}\\@fixture.test/rta`,`text //demo:${secret}@fixture.test/rta suffix`,
  'before https://demo:(RECHECK-9276-PRIVATE)@fixture.test/rta after',
  '[link](//demo:pre(RECHECK-9276-PRIVATE)tail@fixture.test/rta)',
  'http%3A%2F%2Fdemo%3A(RECHECK-9276-PRIVATE)%40fixture.test%2Frta'];
 for(const [n,value] of values.entries()){
  const id='text'+n;
  const savedRaw=await persistRawRecording({sessionId:id,events:[{schemaVersion:'1.0',id:'e',sessionId:id,timestamp:1,type:'click',url:'http://127.0.0.1:9/rta',frame:{frameId:0,framePath:[]},element:{tag:'a',text:value,nearbyText:[value],attributes:{id:'query-link',href:value},locatorCandidates:[]}}],annotations:[]},join(root,'recordings'));
  expect(JSON.parse((await readFile(savedRaw.rawEventsPath,'utf8')).trim()).element.tag).toBe('a');
  const persisted=parseRawEvent(JSON.parse((await readFile(savedRaw.rawEventsPath,'utf8')).trim()));
  const generated=buildWorkflow(normalizeEvents([persisted]),[],{id:id+'-chain',name:'query',sessionId:id,startUrl:persisted.url,createdAt:new Date().toISOString()});
  const chain=await saveWorkflow(generated,join(root,'workflows'));
  expect(parseWorkflow(JSON.parse(await readFile(chain.path,'utf8'))).steps.length).toBeGreaterThan(0);
  const workflow=parseWorkflow({schemaVersion:'1.0',id,version:1,name:'query',startUrl:'http://127.0.0.1:9/rta',variables:{accountId:{required:true,sensitive:false}},steps:[{id:'nav',type:'navigate',url:'http://127.0.0.1:9/rta',parameters:{text:value,relative:'../rta',value:'{{accountId}}'}}],metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
  const saved=await saveWorkflow(workflow,join(root,'workflows'));
  const w=parseWorkflow(JSON.parse(await readFile(saved.path,'utf8')));expect(w.variables).toEqual(workflow.variables);expect(w.steps[0].parameters?.relative).toBe('../rta');
  const failure=await saveFailurePackage({runId:id,stepId:'nav',error:'blocked',domContext:{nearbyText:[value],structure:[]},target:null,workflow},join(root,'failures'));
  expect(JSON.parse(await readFile(join(failure,'workflow.snapshot.json'),'utf8')).id).toBe(id);
 }
 let count=0;
 async function scan(dir:string):Promise<void>{for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await scan(p);else{count++;expect((await readFile(p,'utf8')).toLowerCase(),p).not.toMatch(/rereview(?:%25|%|\/)2?f?url-secret|recheck|9276|private/i);}}}
 await scan(root);expect(count).toBeGreaterThan(12);
});
