import type {Page,Frame,Locator,ElementHandle} from '@playwright/test';
import type {WorkflowStep} from '@web-agent/protocol';
import type {RunContext} from './context.js';
export async function stepScope(context:RunContext,step:WorkflowStep):Promise<Page|Frame>{
  const frame=step.parameters?.frame as {framePath?:unknown;frameId?:unknown}|undefined;
  if(!frame)return context.currentPage;
  if(!Array.isArray(frame.framePath)||!frame.framePath.every(path=>typeof path==='string'))throw new Error('Invalid frame path');
  if(!frame.framePath.length){if(frame.frameId!==0)throw new Error('Nested frame has no stable path');return context.currentPage;}
  let scope:Frame=context.currentPage.mainFrame();
  for(const selector of frame.framePath){
    const locator:Locator=scope.locator(selector);await locator.waitFor({state:'attached'});
    if(await locator.count()!==1)throw new Error('Frame selector is not unique');
    const element:ElementHandle<SVGElement|HTMLElement>|null=await locator.elementHandle();const child:Frame|null|undefined=await element?.contentFrame();if(!child)throw new Error('Frame is unavailable');scope=child;
  }
  return scope;
}
