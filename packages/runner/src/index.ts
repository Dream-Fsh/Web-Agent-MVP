import type { Page } from "@playwright/test";
import { parseWorkflow, type Workflow, type WorkflowStep } from "@web-agent/protocol";
import { assertStepAllowed, type SafetyPolicy } from "@web-agent/safety";
import { executeClick } from "./click.js";
import { executeDownload } from "./download.js";
import { executeInput } from "./input.js";
import { executeNavigate } from "./navigate.js";
import { executeSelect } from "./select.js";
import { executeSwitchTab } from "./switchTab.js";
import { executeWaitFor } from "./waitFor.js";
import type { RunContext } from "./context.js";

export interface RunOptions { policy?: SafetyPolicy; variables?: RunContext["variables"]; runId?: string }
export interface RunStepResult { id: string; type: WorkflowStep["type"]; status: "completed" }
export interface RunResult { steps: RunStepResult[]; downloads: string[] }

/** Runs a validated Workflow directly through Safety, Locator Engine, and Playwright. */
export async function runWorkflow(page: Page, input: Workflow, options: RunOptions = {}): Promise<RunResult> {
  const workflow = parseWorkflow(input);
  const context: RunContext = { currentPage:page, browserContext:page.context(), variables:options.variables ?? {}, outputs:{}, downloads:[], policy:options.policy ?? { mode:"read-only" }, runId:options.runId ?? crypto.randomUUID() };
  const steps: RunStepResult[] = [];
  await context.currentPage.goto(workflow.startUrl, { waitUntil:"domcontentloaded" });
  for (const step of workflow.steps) {
    assertStepAllowed(step, context.policy);
    switch (step.type) {
      case "navigate": await executeNavigate(context, step); break;
      case "click": await executeClick(context, step); break;
      case "input": await executeInput(context, step); break;
      case "select": await executeSelect(context, step); break;
      case "waitFor": await executeWaitFor(context, step); break;
      case "switchTab": await executeSwitchTab(context, step); break;
      case "download": context.downloads.push(await executeDownload(context, step)); break;
      default: throw new Error(`Runner does not execute ${step.type} steps`);
    }
    steps.push({ id:step.id, type:step.type, status:"completed" });
  }
  return { steps, downloads:context.downloads };
}
