import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveWorkflow} from '@web-agent/workflow-builder/persistence';
import {registerSkill,enableSkill,planTask,executePlan} from '../apps/cli/src/agent/index.js';
import type {Workflow,Target} from '@web-agent/protocol';
const css=(value:string,score=1)=>({strategy:'css' as const,value,score});
const target=(value:string):Target=>({fingerprint:{},locators:[css(value)]});
for(const variant of ['input-decoy','reversed','priority','missing','ambiguous','query-decoy','table-decoy','equivalent','execution-drift']){
 test(`account registration validates actual selected element: ${variant}`,async({},info)=>{
  const root=await mkdtemp(join(tmpdir(),'account-target-'));
  let executing=false;
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<h1>fixture</h1><label>账户ID<input name="${variant==='missing'?'missingAccount':'accountId'}" value="10001"></label><input name="${variant==='execution-drift'&&!executing?'unavailable':'otherAccount'}" data-testid="other"><button>查询</button><button id="otherQuery">账户查看</button><div id="otherTable"><thead><tr><th>策略ID</th><th>策略名称</th><th>状态</th></tr></thead></div><table><thead><tr><th>策略ID</th><th>策略名称</th><th>状态</th></tr></thead><tbody><tr><td>RTA001</td><td>账户 10001 策略 001</td><td>生效中</td></tr></tbody></table><script>document.querySelector('button').onclick=()=>document.querySelectorAll('tbody td')[1].textContent='账户 '+document.querySelector('[name=accountId]').value+' 策略 001';</script>`);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();if(!a||typeof a==='string')throw Error('fixture');
  const input=target('input[name="accountId"]'),query={...target('button'),fingerprint:{text:'查询'}},table=target('table');
  // One exact query locator avoids ambiguity from the unrelated button in controls.
  query.locators=[css('button:first-of-type'),css('button',0.01)];
  if(variant==='equivalent')input.locators.push({strategy:'attribute',value:'name=accountId',score:0.9});
  else if(variant==='query-decoy')query.locators=[css('#otherQuery'),css('button',0.01)];
  else if(variant==='table-decoy')table.locators=[css('#otherTable'),css('table',0.01)];
  else {input.locators=[css('input[name="otherAccount"]'),css('input[name="accountId"]',0.01)];
   if(variant==='reversed')input.locators.reverse();
   if(variant==='priority')input.locators=[{strategy:'testId',value:'other',score:1},css('input[name="accountId"]',0.1)];
   if(variant==='missing')input.locators=[css('input[name="otherAccount"]'),css('input[name="accountId"]:disabled',0.01),css('input[name="accountId"]',0)];
   if(variant==='ambiguous')input.locators=[css('input[name="otherAccount"]'),css('input[name="accountId"]')];
  }
  const workflow:Workflow={schemaVersion:'1.0',id:'query',name:'query',version:1,startUrl:`http://127.0.0.1:${a.port}/rta`,variables:{accountId:{required:true,sensitive:false}},steps:[{id:'input',type:'input',target:input,parameters:{value:'{{accountId}}'}},{id:'query',type:'click',target:query},{id:'extract',type:'extract',target:table,parameters:{key:'results',operation:'extractTable'}},{id:'check',type:'assert',parameters:{assertions:[{id:'visible',type:'assertVisible',target:target('h1'),required:true}]}}],metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}};
  try{
   await saveWorkflow(workflow,join(root,'workflows'));
   const attempt=registerSkill(root,{id:'query',name:'query',description:'查询账户结果',purpose:'account_table',workflowId:'query',version:1},{confirm:true,headless:true,variables:{accountId:'10001'}});
   if(variant==='equivalent'||variant==='execution-drift'){
    expect((await attempt).validation.runId).toBeTruthy();expect((await enableSkill(root,'query',true)).enabled).toBe(true);
    if(variant==='execution-drift'){
     const planned=await planTask(root,'查询账户10001表格',{provider:{kind:'test-double',request:async()=>({status:'ready',skillId:'query',version:1,purpose:'account_table',parameters:[{name:'accountId',value:'10001'}],candidates:['query'],missingFields:[]})}});
     executing=true;
     if(!('plan' in planned))throw Error('Expected ready plan');
     const result=await executePlan(root,planned.plan.id,{confirm:true,headless:true});
     expect(result.status).toBe('failed');expect(result.result.steps.at(-1)).toMatchObject({id:'input',status:'failed'});expect(result.result.outputs.results).toBeUndefined();
    }
   }
   else {await expect(attempt).rejects.toThrow();await expect(enableSkill(root,'query',true)).rejects.toThrow();expect(await readdir(join(root,'data/agent/skills')).catch(()=>[])).toHaveLength(0);}
   for(const file of await readdir(join(root,'data/runs')).catch(()=>[])){
    const bytes=await readFile(join(root,'data/runs',file));const saved=JSON.parse(bytes.toString());
    if(variant!=='equivalent'&&variant!=='execution-drift'){
     expect(saved.result.status).toBe('failed');
     expect(saved.result.steps.at(-1).id).toBe(variant==='query-decoy'?'query':variant==='table-decoy'?'extract':'input');
     if(variant!=='ambiguous')expect(saved.result.steps.at(-1).message).toContain('actual target rejected');
    }
    await info.attach(file,{body:bytes,contentType:'application/json'});
   }
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
 });
}
