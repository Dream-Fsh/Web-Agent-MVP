import {stepScope} from './frame.js';
import {guardOrigins} from './origin.js';
import type { Page } from "@playwright/test";
import { parseWorkflow, type Workflow, type WorkflowStep } from "@web-agent/protocol";
import { assertStepAllowed, type SafetyPolicy } from "@web-agent/safety";
import { evaluateAssertions, type Assertion } from "@web-agent/assertions";
import { extractAttribute, extractCount, extractList, extractText, extractTable, extractResolvedTable } from "@web-agent/extractor";
import {withValidatedTarget} from './validated-target.js';
import { executeClick } from "./click.js";
import { executeDownload } from "./download.js";
import { executeInput } from "./input.js";
import { executeNavigate } from "./navigate.js";
import { executeSelect } from "./select.js";
import { executeSwitchTab } from "./switchTab.js";
import { executeWaitFor } from "./waitFor.js";
import type { RunContext } from "./context.js";
import { resolveWorkflowValue } from "./variables.js";

export interface RunOptions { policy?: SafetyPolicy; variables?: RunContext["variables"]; runId?: string; validateTarget?:RunContext['validateTarget'] }
export interface RunStepResult { id: string; type: WorkflowStep["type"]; status: "completed" | "failed" | "blocked"; message?: string }
export interface RunResult { runId:string; workflowId:string; status:"success" | "failed" | "blocked"; steps:RunStepResult[]; outputs:Record<string, unknown>; downloads:string[]; startedAt:string; finishedAt:string }

async function executeExtract(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Extract steps require a target");
  const operation = step.parameters?.operation;
  const key = step.parameters?.key;
  if (typeof operation !== "string" || typeof key !== "string") throw new Error("Extract steps require operation and key");
  if(context.validateTarget){
    if(operation!=='extractTable'&&operation!=='extractText')throw new Error('Validated extraction requires a single text or table target');
    context.outputs[key]=await withValidatedTarget(context,step,async element=>operation==='extractTable'?extractResolvedTable(element):(await element.textContent())??'');
    return;
  }
  if (operation === "extractText") context.outputs[key] = await extractText(await stepScope(context,step), step.target);
  else if (operation === 'extractTable') context.outputs[key] = await extractTable(await stepScope(context,step), step.target);
  else if (operation === "extractAttribute") { const attribute = step.parameters?.attribute; if (typeof attribute !== "string") throw new Error("extractAttribute requires attribute"); context.outputs[key] = await extractAttribute(await stepScope(context,step), step.target, attribute); }
  else if (operation === "extractList") context.outputs[key] = await extractList(await stepScope(context,step), step.target);
  else if (operation === "extractCount") context.outputs[key] = await extractCount(await stepScope(context,step), step.target);
  else throw new Error(`Unsupported extraction operation: ${operation}`);
}

/** Runs a validated Workflow directly through Safety, Locator Engine, and Playwright. */
export async function runWorkflow(page: Page, input: Workflow, options: RunOptions = {}): Promise<RunResult> {
  const workflow = parseWorkflow(input);
  const context: RunContext = { currentPage:page, recordingStartPage:page, recordingPages:[page], browserPages:page.context().pages(), recordingOwners:new Map(), existingPages:page.context().pages(), browserContext:page.context(), variables:options.variables ?? {}, outputs:{}, downloads:[], policy:options.policy ?? { mode:"read-only" }, runId:options.runId ?? crypto.randomUUID() };
  context.validateTarget=options.validateTarget;
  const trackPage=(newPage:Page)=>{context.recordingPages!.push(newPage);context.browserPages!.push(newPage);context.recordingOwners!.set(newPage,newPage.opener());};
  context.browserContext.on('page',trackPage);
  const startedAt = new Date().toISOString();
  const steps: RunStepResult[] = [];
  let guard:Awaited<ReturnType<typeof guardOrigins>>|undefined;
  try {
    try {
      guard=await guardOrigins(context.browserContext,workflow.startUrl,context.policy);
      guard.assertReady();
      await context.currentPage.goto(workflow.startUrl, { waitUntil:"domcontentloaded" });
      await guard.check(context.currentPage);
    } catch(error) {
      try {guard?.assertReady();}catch(blocked){error=blocked;}
      return {runId:context.runId,workflowId:workflow.id,status:error instanceof Error&&error.name==='UnsafeActionBlockedError'?'blocked':'failed',steps:[{id:'navigation',type:'navigate',status:error instanceof Error&&error.name==='UnsafeActionBlockedError'?'blocked':'failed',message:error instanceof Error?error.message:String(error)}],outputs:{},downloads:[],startedAt,finishedAt:new Date().toISOString()};
    }
  for (const step of workflow.steps) {
    try {
      await guard.check(context.currentPage);
      const resolvedStep = { ...step, parameters:step.parameters ? resolveWorkflowValue(step.parameters, context.variables) : undefined };
      assertStepAllowed(resolvedStep, context.policy, workflow.startUrl);
      switch (resolvedStep.type) {
      case "navigate": await executeNavigate(context, resolvedStep); break;
      case "click": await executeClick(context, resolvedStep); break;
      case "input": await executeInput(context, resolvedStep); break;
      case "select": await executeSelect(context, resolvedStep); break;
      case "waitFor": await executeWaitFor(context, resolvedStep); break;
      case "switchTab": await executeSwitchTab(context, resolvedStep); break;
        case "download": context.downloads.push(await executeDownload(context, resolvedStep)); break;
        case "extract": await executeExtract(context, resolvedStep); break;
        case "assert": {
          const assertions = resolvedStep.parameters?.assertions;
          if (!Array.isArray(assertions)) throw new Error("Assert steps require assertions");
          const result = await evaluateAssertions(await stepScope(context,resolvedStep), assertions as Assertion[]);
          context.outputs[step.id] = result;
          if (!result.success) return { runId:context.runId, workflowId:workflow.id, status:"failed", steps:[...steps, { id:step.id, type:step.type, status:"failed", message:"Required assertions failed" }], outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
          break;
        }
        default: throw new Error(`Runner does not execute ${step.type} steps`);
      }
      await guard.check(context.currentPage);
      steps.push({ id:step.id, type:step.type, status:"completed" });
    } catch (error) {
      try {guard.assertReady();}catch(violation){error=violation;}
      const blocked = error instanceof Error && error.name === "UnsafeActionBlockedError";
      return { runId:context.runId, workflowId:workflow.id, status:blocked ? "blocked" : "failed", steps:[...steps, { id:step.id, type:step.type, status:blocked ? "blocked" : "failed", message:error instanceof Error ? error.message : String(error) }], outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
    }
  }
  return { runId:context.runId, workflowId:workflow.id, status:"success", steps, outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
  } finally {context.browserContext.off('page',trackPage);await guard?.close();}
}
