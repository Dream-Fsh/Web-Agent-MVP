import type { Page } from "@playwright/test";
import { parseWorkflow, type Workflow, type WorkflowStep } from "@web-agent/protocol";
import { assertStepAllowed, type SafetyPolicy } from "@web-agent/safety";
import { evaluateAssertions, type Assertion } from "@web-agent/assertions";
import { extractAttribute, extractCount, extractList, extractText } from "@web-agent/extractor";
import { executeClick } from "./click.js";
import { executeDownload } from "./download.js";
import { executeInput } from "./input.js";
import { executeNavigate } from "./navigate.js";
import { executeSelect } from "./select.js";
import { executeSwitchTab } from "./switchTab.js";
import { executeWaitFor } from "./waitFor.js";
import type { RunContext } from "./context.js";

export interface RunOptions { policy?: SafetyPolicy; variables?: RunContext["variables"]; runId?: string }
export interface RunStepResult { id: string; type: WorkflowStep["type"]; status: "completed" | "failed" | "blocked"; message?: string }
export interface RunResult { runId:string; workflowId:string; status:"success" | "failed" | "blocked"; steps:RunStepResult[]; outputs:Record<string, unknown>; downloads:string[]; startedAt:string; finishedAt:string }

async function executeExtract(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Extract steps require a target");
  const operation = step.parameters?.operation;
  const key = step.parameters?.key;
  if (typeof operation !== "string" || typeof key !== "string") throw new Error("Extract steps require operation and key");
  if (operation === "extractText") context.outputs[key] = await extractText(context.currentPage, step.target);
  else if (operation === "extractAttribute") { const attribute = step.parameters?.attribute; if (typeof attribute !== "string") throw new Error("extractAttribute requires attribute"); context.outputs[key] = await extractAttribute(context.currentPage, step.target, attribute); }
  else if (operation === "extractList") context.outputs[key] = await extractList(context.currentPage, step.target);
  else if (operation === "extractCount") context.outputs[key] = await extractCount(context.currentPage, step.target);
  else throw new Error(`Unsupported extraction operation: ${operation}`);
}

/** Runs a validated Workflow directly through Safety, Locator Engine, and Playwright. */
export async function runWorkflow(page: Page, input: Workflow, options: RunOptions = {}): Promise<RunResult> {
  const workflow = parseWorkflow(input);
  const context: RunContext = { currentPage:page, browserContext:page.context(), variables:options.variables ?? {}, outputs:{}, downloads:[], policy:options.policy ?? { mode:"read-only" }, runId:options.runId ?? crypto.randomUUID() };
  const startedAt = new Date().toISOString();
  const steps: RunStepResult[] = [];
  await context.currentPage.goto(workflow.startUrl, { waitUntil:"domcontentloaded" });
  for (const step of workflow.steps) {
    try {
      assertStepAllowed(step, context.policy);
      switch (step.type) {
      case "navigate": await executeNavigate(context, step); break;
      case "click": await executeClick(context, step); break;
      case "input": await executeInput(context, step); break;
      case "select": await executeSelect(context, step); break;
      case "waitFor": await executeWaitFor(context, step); break;
      case "switchTab": await executeSwitchTab(context, step); break;
        case "download": context.downloads.push(await executeDownload(context, step)); break;
        case "extract": await executeExtract(context, step); break;
        case "assert": {
          const assertions = step.parameters?.assertions;
          if (!Array.isArray(assertions)) throw new Error("Assert steps require assertions");
          const result = await evaluateAssertions(context.currentPage, assertions as Assertion[]);
          context.outputs[step.id] = result;
          if (!result.success) return { runId:context.runId, workflowId:workflow.id, status:"failed", steps:[...steps, { id:step.id, type:step.type, status:"failed", message:"Required assertions failed" }], outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
          break;
        }
        default: throw new Error(`Runner does not execute ${step.type} steps`);
      }
      steps.push({ id:step.id, type:step.type, status:"completed" });
    } catch (error) {
      const blocked = error instanceof Error && error.name === "UnsafeActionBlockedError";
      return { runId:context.runId, workflowId:workflow.id, status:blocked ? "blocked" : "failed", steps:[...steps, { id:step.id, type:step.type, status:blocked ? "blocked" : "failed", message:error instanceof Error ? error.message : String(error) }], outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
    }
  }
  return { runId:context.runId, workflowId:workflow.id, status:"success", steps, outputs:context.outputs, downloads:context.downloads, startedAt, finishedAt:new Date().toISOString() };
}
