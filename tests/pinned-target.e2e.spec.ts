import {test,expect} from '@playwright/test';
import {withValidatedTarget} from '../packages/runner/src/validated-target.js';
import type {RunContext} from '../packages/runner/src/context.js';
import type {WorkflowStep} from '@web-agent/protocol';
for(const operation of ['input','click'] as const){
 test(`validated ${operation} never re-resolves a replaced node`,async({page})=>{
  await page.setContent('<input id="account"><button id="query">查询</button>');
  const selector=operation==='input'?'#account':'#query';
  const step:WorkflowStep={id:'operation',type:operation,target:{fingerprint:{},locators:[{strategy:'css',value:selector,score:1}]},parameters:{value:'20002'}};
  let validated=0;
  const context={currentPage:page,validateTarget:async()=>{validated++;await page.locator(selector).evaluate(node=>{const clone=node.cloneNode(true) as HTMLElement;clone.dataset.replacement='true';node.replaceWith(clone);});}} as RunContext;
  await expect(withValidatedTarget(context,step,element=>operation==='input'?element.fill('20002'):element.click())).rejects.toThrow();
  expect(validated).toBe(1);
  expect(await page.locator(selector).getAttribute('data-replacement')).toBe('true');
  if(operation==='input')expect(await page.locator(selector).inputValue()).toBe('');
 });
}
