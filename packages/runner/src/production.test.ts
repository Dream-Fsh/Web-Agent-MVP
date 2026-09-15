import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkflow } from '@web-agent/workflow-builder';
import { saveWorkflow } from '@web-agent/workflow-builder/persistence';
import * as production from './production.js';
import { startFixtureServer } from '@web-agent/fixture-site';

it('rejects missing required bindings before launching a browser or writing run evidence', async () => {
  expect(production).toHaveProperty('runStoredWorkflow');
  const root = await mkdtemp(join(tmpdir(),'run-bindings-'));
  try {
    const workflow = buildWorkflow([],[],{id:'query',name:'Query',sessionId:'s',startUrl:'http://127.0.0.1/rta',createdAt:new Date().toISOString()});
    workflow.variables = {accountId:{required:true}};
    await saveWorkflow(workflow,join(root,'workflows'));
    await expect(production.runStoredWorkflow('query',{root,headless:true,variables:{}})).rejects.toThrow(/accountId/);
    await expect(readFile(join(root,'data/browser-profile/Default/Preferences'))).rejects.toThrow();
  } finally { await rm(root,{recursive:true,force:true}); }
});

it('runs a builder-generated workflow through Generic Runner and persists outputs and real failures', async () => {
  expect(production).toHaveProperty('runStoredWorkflow');
  const root = await mkdtemp(join(tmpdir(),'run-production-'));
  const fixture = await startFixtureServer();
  try {
    const target = {fingerprint:{tag:'table'},locators:[{strategy:'css' as const,value:'table',score:1}]};
    const generated = (expected:string) => buildWorkflow([], [
      {id:'extract',sessionId:'s',type:'extraction',target,metadata:{operation:'extractTable',key:'results'}},
      {id:'assert',sessionId:'s',type:'requiredAssertion',target,metadata:{assertionType:'assertText',expected,required:true}},
    ], {id:'query',name:'Query',sessionId:'s',startUrl:`${fixture.baseUrl}/rta`,createdAt:new Date().toISOString()});
    await saveWorkflow(generated('RTA001'),join(root,'workflows'));
    const success = await production.runStoredWorkflow('query',{root,headless:true});
    expect(success.status).toBe('success');
    expect((success.outputs.results as {rows:unknown[]}).rows).toHaveLength(10);
    await saveWorkflow(generated('never-present'),join(root,'workflows'));
    const failed = await production.runStoredWorkflow('query',{root,headless:true});
    expect(failed.status).toBe('failed');
    const evidence = JSON.parse(await readFile(join(root,'data/failures',failed.runId,'step-2/failure.json'),'utf8'));
    expect(evidence.error).toContain('Required assertions failed');
    expect(JSON.parse(await readFile(join(root,'data/runs',failed.runId+'.json'),'utf8'))).toMatchObject({version:2,result:{status:'failed'}});
  } finally { await fixture.close(); await rm(root,{recursive:true,force:true}); }
}, 20000);

it('redacts sensitive numeric bindings and outputs as well as text',()=>{
  const workflow=buildWorkflow([],[],{id:'w',name:'w',sessionId:'s',startUrl:'http://127.0.0.1',createdAt:new Date().toISOString()});
  workflow.variables={accountId:{required:true,sensitive:true}};
  expect(production.redactRunEvidence({variables:{accountId:12345},outputs:{value:12345,text:'id 12345'}},workflow,{accountId:12345})).toEqual({variables:{accountId:'[REDACTED]'},outputs:{value:'[REDACTED]',text:'id [REDACTED]'}});
});

it('local-only repair replay blocks a redirect before contacting a non-allowed host',async()=>{
  const {createServer}=await import('node:http');
  const root=await mkdtemp(join(tmpdir(),'repair-redirect-'));let contacted=0;
  const destination=createServer((_req,res)=>{contacted++;res.end('external');});
  await new Promise<void>(resolve=>destination.listen(0,'127.0.0.2',resolve));
  const address=destination.address();if(!address||typeof address==='string')throw new Error('No destination');
  const source=createServer((_req,res)=>res.writeHead(302,{location:`http://127.0.0.2:${address.port}`}).end());
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceAddress=source.address();if(!sourceAddress||typeof sourceAddress==='string')throw new Error('No source');
  try{
    const workflow=buildWorkflow([],[],{id:'w',name:'w',sessionId:'s',startUrl:`http://127.0.0.1:${sourceAddress.port}`,createdAt:new Date().toISOString()});
    const result=await production.executeStoredRun(workflow,{root,headless:true,localOnly:true});
    expect(contacted).toBe(0);expect(result.status).not.toBe('success');
  }finally{await new Promise<void>(resolve=>{source.close(()=>resolve());source.closeAllConnections();});await new Promise<void>(resolve=>{destination.close(()=>resolve());destination.closeAllConnections();});await rm(root,{recursive:true,force:true});}
},20000);

it.each([1,true])('keeps protocol fields valid while omitting a sensitive default %s',async secret=>{
  const {parseWorkflow}=await import('@web-agent/protocol');
  const workflow=buildWorkflow([],[],{id:'w',name:'w',sessionId:'s',startUrl:'http://127.0.0.1',createdAt:new Date().toISOString()});
  workflow.variables={accountId:{required:true,sensitive:true,defaultValue:secret}};
  const snapshot=production.redactWorkflowSnapshot(workflow);
  expect(parseWorkflow(snapshot).version).toBe(1);
  expect(snapshot.variables.accountId).toEqual({required:true,sensitive:true});
});

it('does not touch an occupied automation profile before acquiring its lease',async()=>{
  const {acquirePersistenceLease}=await import('@web-agent/workflow-builder/persistence');
  const {openAutomationBrowser}=await import('./browser.js');
  const root=await mkdtemp(join(tmpdir(),'profile-exclusive-'));
  const lease=await acquirePersistenceLease(join(root,'data/browser-profile.lock'),{heartbeatMs:0});
  try{
    const outcome=await openAutomationBrowser({root,headless:true}).then(async opened=>{await opened.context.close();return 'opened';},()=> 'blocked');
    expect(outcome).toBe('blocked');
    await expect(readFile(join(root,'data/browser-profile/Default/Preferences'))).rejects.toThrow();
  }finally{await lease.close();await rm(root,{recursive:true,force:true});}
});
