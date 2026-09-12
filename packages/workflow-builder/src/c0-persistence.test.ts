import {expect,it} from 'vitest';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistRawRecording} from '@web-agent/recording-adapter';
import {normalizeEvents} from '@web-agent/normalizer';
import {parseRawEvent,parseWorkflow} from '@web-agent/protocol';
import {buildWorkflow} from './index.js';
import {saveWorkflow} from './persistence.js';
const secret='REREVIEW/URL-SECRET', encoded=encodeURIComponent(secret);
async function assertClean(directory:string):Promise<void> {
 for(const entry of await readdir(directory,{withFileTypes:true})) {
  const path=join(directory,entry.name);
  if(entry.isDirectory()) await assertClean(path);
  else {const text=await readFile(path,'utf8');for(const marker of [secret,encoded,encodeURIComponent(encoded)]) expect(text.toLowerCase(),path).not.toContain(marker.toLowerCase());}
 }
}
it('persists C0 RawEvents through normalization, builder and version saving without credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wa-c0-chain-')); console.info('C0 chain artifacts:',root);
 for(let code=0;code<32;code++) {
  const prefix=String.fromCharCode(code), sessionId=`s${code}`;
  const url=prefix+`http://demo:${encoded}@127.0.0.1:9/rta`;
  const attribute=' '+prefix+`//demo:${encoded}@fixture.test/rta`;
  const raw=parseRawEvent({schemaVersion:'1.0',id:'e',sessionId,timestamp:1,type:'navigation',url,frame:{frameId:0,framePath:[]},element:{tag:'a',attributes:{href:attribute,src:url,action:prefix+`//demo:${encoded}\\@fixture.test/rta`,formaction:prefix+`[${url.slice(1)}](${url.slice(1)})`},nearbyText:[],locatorCandidates:[]}});
  const saved=await persistRawRecording({sessionId,events:[raw],annotations:[]},join(root,'recordings'));
  const persisted=parseRawEvent(JSON.parse((await readFile(saved.rawEventsPath,'utf8')).trim()));
  const workflow=buildWorkflow(normalizeEvents([persisted]),[],{id:sessionId,name:'query',sessionId,startUrl:persisted.url,createdAt:new Date().toISOString()});
  const version=await saveWorkflow(workflow,join(root,'workflows'));
  expect(parseWorkflow(JSON.parse(await readFile(version.path,'utf8'))).startUrl).toBe('http://127.0.0.1:9/rta');
 }
 await assertClean(root);
});
it('independently sanitizes legacy Workflow input at the actual save boundary',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wa-c0-legacy-'));console.info('C0 legacy artifacts:',root);
 const clean=buildWorkflow([],[],{id:'legacy',name:'query',sessionId:'s',startUrl:'http://127.0.0.1:9/rta',createdAt:new Date().toISOString()});
 for(let code=0;code<32;code++) {
  const url=String.fromCharCode(code)+`http://demo:${encoded}@127.0.0.1:9/rta`;
  const legacy=parseWorkflow({...clean,startUrl:url,steps:[{id:'nav',type:'navigate',url}]});
  const saved=await saveWorkflow(legacy,root);
  expect(parseWorkflow(JSON.parse(await readFile(saved.path,'utf8'))).startUrl).toBe('http://127.0.0.1:9/rta');
 }
 await assertClean(root);
});
it('keeps sensitive variable definitions usable when persisting a normal workflow',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wa-c0-variables-'));console.info('C0 variable artifacts:',root);
 const workflow=buildWorkflow([],[],{id:'bindings',name:'query',sessionId:'s',startUrl:'http://127.0.0.1:9/rta',createdAt:new Date().toISOString()});
 workflow.variables={password:{required:true,sensitive:true,defaultValue:secret},accountId:{required:true,defaultValue:'10001'}};
 const saved=await saveWorkflow(workflow,root);
 const result=parseWorkflow(JSON.parse(await readFile(saved.path,'utf8')));
 expect(result.variables.password).toEqual({required:true,sensitive:true});
 expect(result.variables.accountId.defaultValue).toBe('10001');
 await assertClean(root);
});
