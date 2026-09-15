import {expect,it} from 'vitest';
import type {Workflow} from '@web-agent/protocol';
import {contract,successful} from './agent/contracts.js';
const target=(value:string)=>({fingerprint:{},locators:[{strategy:'css' as const,value,score:1}]});
const manifest={id:'query',name:'query',description:'查询账户表格',purpose:'account_table' as const,workflowId:'query',version:1};
function workflow():Workflow{return {schemaVersion:'1.0',id:'query',name:'query',version:1,startUrl:'http://127.0.0.1:4318/rta',variables:{accountId:{required:true,sensitive:false}},steps:[
 {id:'input',type:'input',target:target('input[name="accountId"]'),parameters:{value:'{{accountId}}'}},
 {id:'query',type:'click',target:{...target('button'),fingerprint:{text:'查询'}}},
 {id:'extract',type:'extract',target:target('table'),parameters:{operation:'extractTable',key:'results'}},
 {id:'assert',type:'assert',parameters:{assertions:[{id:'visible',type:'assertVisible',target:target('h1'),required:true}]}},
 ],metadata:{createdAt:'2026-09-15T00:00:00.000Z',updatedAt:'2026-09-15T00:00:00.000Z'}};}
it.each(['missing','metadata','unrelated','no-query','after-extraction','navigate-reset'])('rejects ineffective account consumption: %s',kind=>{
 const w=workflow();
 if(kind==='missing'||kind==='metadata'){w.steps=w.steps.filter(s=>s.type!=='input');if(kind==='metadata')w.name='{{accountId}}';}
 if(kind==='unrelated')w.steps[0].target=target('input[name="otherAccount"]');
 if(kind==='no-query')w.steps=w.steps.filter(s=>s.type!=='click');
 if(kind==='after-extraction')w.steps=[w.steps[2],w.steps[0],w.steps[1],w.steps[3]];
 if(kind==='navigate-reset')w.steps.splice(2,0,{id:'reset',type:'navigate',url:w.startUrl});
 expect(()=>contract(w,manifest)).toThrow(/account|query|契约/i);
});
it.each(['10001','20002'])('requires returned identity for %s rather than input echo',id=>{
 const w=workflow(),spec=contract(w,manifest);
 const result:any={status:'success',steps:w.steps.map(s=>({id:s.id,status:'completed'})),outputs:{results:{headers:['策略ID','策略名称','状态'],rows:[['RTA001',`账户 ${id} 策略 001`,'生效中']]},assert:{success:true,results:[{id:'visible',required:true,status:'passed'}]}}};
 expect((successful as Function)(result,spec,{accountId:id})).toBe(true);
 for(const value of ['策略 001','账户 99999 策略 001','账户 '+id+' 策略 002','']){
  result.outputs.results.rows[0][1]=value;
  expect((successful as Function)(result,spec,{accountId:id})).toBe(false);
 }
});
