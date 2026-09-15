import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {saveWorkflow} from '@web-agent/workflow-builder/persistence';
import type {Workflow} from '@web-agent/protocol';
const target=(value:string)=>({fingerprint:{},locators:[{strategy:'css' as const,value,score:1}]});
async function cli(root:string,args:string[],decision?:unknown){
 return await new Promise<{code:number|null;stdout:string;stderr:string}>((done,reject)=>{
  // Always explicit; a missing fixture is a failing double, never PATH Codex.
  const code=decision?`process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(decision))}))`:'process.exit(93)';
  const child=spawn(process.execPath,[resolve('apps/cli/dist/bin.js'),'agent',...args,'--root',root],{windowsHide:true,env:{...process.env,WEB_AGENT_PLANNER_TEST_MODE:'1',WEB_AGENT_PLANNER_TEST_COMMAND:JSON.stringify([process.execPath,'-e',code,'--'])},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),30000);
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);done({code,stdout,stderr});});
 });
}
test('real fixture account identity and text evidence survive all persistence/CLI boundaries',async({},info)=>{
 test.setTimeout(180000);
 const root=await mkdtemp(join(tmpdir(),'agent-fix-browser-'));
 const secret='REREVIEW%2FURL-SECRET',abs=`http://demo:${secret}@127.0.0.1:9/rta`;
 const variants=[`\u0000[${abs}](${abs})`,`\u0001//demo:${secret}\\@fixture.test/rta`,`before https://demo:REREVIEW\t%2FURL-SECRET@fixture.test/rta after`];
 let mode='correct',text='normal-title';
 const server=createServer((_req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<h1></h1><label>账户ID<input name="accountId"></label><button>查询</button><p id="query-result"></p><table><thead><tr><th>策略ID</th><th>策略名称</th><th>状态</th></tr></thead><tbody><tr><td>RTA001</td><td>策略 001</td><td></td></tr></tbody></table><script>
  document.querySelector('h1').textContent=${JSON.stringify(text)};document.querySelector('tr td:last-child').textContent=${JSON.stringify(text)};
  document.querySelector('button').onclick=()=>{const id=document.querySelector('input').value;document.querySelector('#query-result').textContent='账户 '+id+' 的查询结果';const mode=${JSON.stringify(mode)};document.querySelectorAll('tbody td')[1].textContent=mode==='default'?'策略 001':mode==='missing'?'':('账户 '+(mode==='wrong'?'99999':id)+' 策略 001');};</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error('fixture not bound');
 const origin=`http://127.0.0.1:${address.port}`;
 async function seed(id:string,account:boolean,strict=false){
  const w:Workflow={schemaVersion:'1.0',id,name:id,version:1,startUrl:origin+(account?'/rta':'/dashboard'),variables:account?{accountId:{required:true,sensitive:false}}:{},steps:[
   ...(account?[{id:'input',type:'input' as const,target:target('input[name="accountId"]'),parameters:{value:'{{accountId}}'}},{id:'query',type:'click' as const,target:{...target('button'),fingerprint:{text:'查询'}}}]:[]),
   {id:'extract',type:'extract',target:target(account?'table':'h1'),parameters:{key:'results',operation:account?'extractTable':'extractText'}},
   {id:'check',type:'assert',parameters:{assertions:[{id:'required',type:strict?'assertText':'assertVisible',target:target('h1'),required:true,...(strict?{expected:'normal-title'}:{})}]}},
  ],metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}};
  await saveWorkflow(w,join(root,'workflows'));const file=join(root,id+'.json');await writeFile(file,JSON.stringify({id,name:id,description:account?'查询账户结果':'读取标题',purpose:account?'account_table':'dashboard_title',workflowId:id,version:1}));
  const registered=await cli(root,['skills','register',file,'--confirm','--headless',...(account?['--var','accountId=10001']:[])]);expect(registered.code,registered.stdout+registered.stderr).toBe(0);
  expect((await cli(root,['skills','enable',id,'--confirm'])).code).toBe(0);
 }
 async function execute(id:string,account?:string){
  const planned=await cli(root,['plan',account?`查询账户${account}表格`:'读取标题','--skill',id],{status:'ready',skillId:id,version:1,purpose:account?'account_table':'dashboard_title',parameters:account?[{name:'accountId',value:account}]:[],candidates:[id],missingFields:[]});
  expect(planned.code,planned.stdout+planned.stderr).toBe(0);const plan=JSON.parse(planned.stdout).plan;
  const execution=await cli(root,['execute',plan.id,'--confirm','--headless']);
  const outcome=JSON.parse(execution.stdout);expect(outcome.modelKind).toBe('test-double');
  await writeFile(info.outputPath(plan.id+'-cli.json'),JSON.stringify(execution));
  const onDisk=await readFile(join(root,'data/runs',outcome.result.runId+'.json'),'utf8');expect(JSON.parse(onDisk).result).toEqual(outcome.result);expect(JSON.parse(onDisk).variables).toEqual(plan.variables);
  await copyFile(join(root,'data/runs',outcome.result.runId+'.json'),info.outputPath(plan.id+'-run.json'));
  await copyFile(join(root,'data/agent/results',plan.id+'.json'),info.outputPath(plan.id+'-result.json'));
  expect(JSON.parse(await readFile(join(root,'data/agent/results',plan.id+'.json'),'utf8')).payload).toEqual(outcome);
  expect((await cli(root,['execute',plan.id,'--confirm','--headless'])).code).toBe(2);
  return {execution,outcome,plan};
 }
 try{
  await seed('query',true);await seed('title',false);await seed('strict-title',false,true);
  const observations:unknown[]=[];
  for(const id of ['10001','20002']){const {outcome,execution}=await execute('query',id);expect(execution.code).toBe(0);expect(outcome.status).toBe('success');expect(outcome.result.outputs.results.rows[0][1]).toBe(`账户 ${id} 策略 001`);observations.push({account:id,status:outcome.status});}
  for(const invalid of ['default','wrong','missing']){mode=invalid;const {outcome,execution}=await execute('query','30003');expect(execution.code).toBe(2);expect(outcome).toMatchObject({status:'failed',result:{status:'success'},taskValidation:{accountIdentity:'failed'}});observations.push({mode:invalid,status:outcome.status,runnerStatus:outcome.result.status});}
  mode='correct';
  for(const variant of variants){text=variant;
   for(const [id,account] of [['title',undefined],['query','40004']] as const){const {outcome,execution}=await execute(id,account);expect(execution.code).toBe(0);expect(outcome.status).toBe('success');if(account){expect(outcome.result.outputs.results.rows).toHaveLength(1);expect(outcome.result.outputs.results.rows[0]).toHaveLength(3);}}
  }
  text=variants[0];const failure=await execute('strict-title');expect(failure.execution.code).toBe(2);expect(failure.outcome.result.status).toBe('failed');
  const snapshot=join(root,'data/failures',failure.outcome.result.runId,'check/workflow.snapshot.json');expect(JSON.parse(await readFile(snapshot,'utf8')).id).toBe('strict-title');
  let checked=0;async function scan(dir:string):Promise<void>{for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await scan(p);else{const value=await readFile(p,'utf8');for(const marker of ['REREVIEW/URL-SECRET',secret,encodeURIComponent(secret)])expect(value.toLowerCase(),p).not.toContain(marker.toLowerCase());checked++;}}}
  await scan(join(root,'data/runs'));await scan(join(root,'data/agent/results'));await scan(join(root,'data/failures'));await scan(info.outputDir);
  await writeFile(info.outputPath('summary.json'),JSON.stringify({observations,checkedFiles:checked,realModelRequests:0,planner:'explicit test double',failureSnapshotRead:true}));
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
