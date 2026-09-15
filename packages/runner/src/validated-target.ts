import type {ElementHandle} from '@playwright/test';
import type {WorkflowStep} from '@web-agent/protocol';
import {resolveTarget} from '@web-agent/locator-engine';
import {stepScope} from './frame.js';
import type {RunContext} from './context.js';

/** Pin the selected DOM node: validation and operation never re-resolve a locator. */
export async function withValidatedTarget<T>(context:RunContext,step:WorkflowStep,operation:(element:ElementHandle)=>Promise<T>):Promise<T>{
 if(!step.target)throw new Error('Operation requires a target');
 const resolved=await resolveTarget(await stepScope(context,step),step.target);
 const element=await resolved.locator.elementHandle();
 if(!element)throw new Error('Resolved target detached');
 try{await context.validateTarget?.(step,element);return await operation(element);}finally{await element.dispose();}
}
