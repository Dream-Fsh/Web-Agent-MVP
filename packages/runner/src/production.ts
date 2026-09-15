import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { Workflow } from '@web-agent/protocol';
import { loadWorkflow } from '@web-agent/workflow-builder/persistence';
import { redactSensitiveData, redactWorkflow } from '@web-agent/safety';
import { saveFailurePackage } from '@web-agent/failure';
import { openAutomationBrowser } from './browser.js';
import { runWorkflow, type RunResult, type RunOptions } from './index.js';

export interface StoredRunOptions { root: string; workflowsRoot?: string; headless?: boolean; variables?: Record<string,string|number|boolean>; signal?:AbortSignal; localOnly?:boolean; validateTarget?:RunOptions['validateTarget'] }

export function resolveBindings(workflow: Workflow, supplied: StoredRunOptions['variables'] = {}) {
  const bindings: Record<string,string|number|boolean> = {};
  for (const name of Object.keys(supplied)) if (!Object.hasOwn(workflow.variables,name)) throw new Error(`Unknown variable: ${name}`);
  for (const [name,definition] of Object.entries(workflow.variables)) {
    const value = supplied[name] ?? definition.defaultValue;
    if (definition.required && (value === undefined || value === '[REDACTED]')) throw new Error(`Required variable missing: ${name}`);
    if (value !== undefined) Object.defineProperty(bindings,name,{value,enumerable:true});
  }
  return bindings;
}

export function redactRunEvidence<T>(value:T, workflow:Workflow, bindings:Record<string,string|number|boolean>):T {
  const secrets = Object.entries(workflow.variables).filter(([,definition])=>definition.sensitive).map(([name])=>String(bindings[name] ?? '')).filter(Boolean);
  const scrub = (input:unknown):unknown => {
    if ((typeof input === 'number' || typeof input === 'boolean') && secrets.includes(String(input))) return '[REDACTED]';
    if (typeof input === 'string') return secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED]'),input);
    if (Array.isArray(input)) return input.map(scrub);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key,child])=>[key,scrub(child)]));
    return input;
  };
  return scrub(redactSensitiveData(value)) as T;
}

/** Snapshot retains the unbound template; runtime secrets never enter protocol fields. */
export function redactWorkflowSnapshot(workflow:Workflow):Workflow {
  return redactWorkflow({...workflow,variables:Object.fromEntries(Object.entries(workflow.variables).map(([name,definition])=>{
    const {defaultValue,...flags}=definition;
    return [name,definition.sensitive?flags:definition];
  }))});
}
export async function collectRepairContext(page:Page) {
  return page.locator('button,input,label,table,p[role="status"]').evaluateAll(elements=>({
    nearbyText:elements.slice(0,30).map(element=>(element.textContent ?? '').trim().slice(0,200)),
    structure:elements.slice(0,30).map(element=>JSON.stringify({tag:element.tagName.toLowerCase(),role:element.getAttribute('role'),name:element.getAttribute('name'),id:element.id,testId:element.getAttribute('data-testid'),'aria-label':element.getAttribute('aria-label')})),
  }));
}

/** Composes existing Runner and Failure Package; no duplicate execution or Safety logic. */
export async function executeStoredRun(workflow:Workflow,options:StoredRunOptions):Promise<RunResult> {
  options.signal?.throwIfAborted();
  const root = resolve(options.root);
  const variables = resolveBindings(workflow,options.variables);
  const {context} = await openAutomationBrowser({root,headless:options.headless,localOnly:options.localOnly,blockServiceWorkers:true});
  const abort=()=>{void context.close();};
  options.signal?.addEventListener('abort',abort,{once:true});
  const page = context.pages()[0] ?? await context.newPage();
  const runId = crypto.randomUUID();
  try {
    options.signal?.throwIfAborted();
    let result:RunResult;
    try { result = await runWorkflow(page,workflow,{variables,runId,validateTarget:options.validateTarget}); }
    catch (error) { const now = new Date().toISOString(); result = {runId,workflowId:workflow.id,status:'failed',steps:[{id:'navigation',type:'navigate',status:'failed',message:error instanceof Error ? error.message : String(error)}],outputs:{},downloads:[],startedAt:now,finishedAt:now}; }
    options.signal?.throwIfAborted();
    const safeResult:RunResult = {...result,outputs:redactRunEvidence(result.outputs,workflow,variables),downloads:redactRunEvidence(result.downloads,workflow,variables),steps:result.steps.map(step=>({...step,message:step.message?redactRunEvidence(step.message,workflow,variables):undefined}))};
    if (result.status !== 'success') {
      const failed = result.steps.at(-1)!;
      const domContext = await collectRepairContext(page).catch(()=>({nearbyText:[],structure:[]}));
      await saveFailurePackage({runId,stepId:failed.id,...redactRunEvidence({error:failed.message ?? result.status,domContext},workflow,variables),target:workflow.steps.find(step=>step.id===failed.id)?.target ?? null,workflow:redactWorkflowSnapshot(workflow)},join(root,'data/failures'));
    }
    await mkdir(join(root,'data/runs'),{recursive:true});
    await writeFile(join(root,'data/runs',`${runId}.json`),JSON.stringify({workflowId:workflow.id,version:workflow.version,variables:redactRunEvidence(variables,workflow,variables),result:safeResult},null,2)+'\n');
    return safeResult;
  } finally { options.signal?.removeEventListener('abort',abort);await context.close(); }
}

export async function runStoredWorkflow(id:string,options:StoredRunOptions):Promise<RunResult> {
  return executeStoredRun(await loadWorkflow(options.workflowsRoot ?? join(options.root,'workflows'),id),options);
}
