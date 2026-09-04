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

export interface RunOptions { policy?: SafetyPolicy }
export interface RunStepResult { id: string; type: WorkflowStep["type"]; status: "completed" }
export interface RunResult { steps: RunStepResult[]; downloads: string[] }

/** Runs a validated Workflow directly through Safety, Locator Engine, and Playwright. */
export async function runWorkflow(page: Page, input: Workflow, options: RunOptions = {}): Promise<RunResult> {
  const workflow = parseWorkflow(input);
  const downloads: string[] = [];
  const steps: RunStepResult[] = [];
  await page.goto(workflow.startUrl, { waitUntil:"domcontentloaded" });
  for (const step of workflow.steps) {
    assertStepAllowed(step, options.policy);
    switch (step.type) {
      case "navigate": await executeNavigate(page, step); break;
      case "click": await executeClick(page, step); break;
      case "input": await executeInput(page, step); break;
      case "select": await executeSelect(page, step); break;
      case "waitFor": await executeWaitFor(page, step); break;
      case "switchTab": await executeSwitchTab(page, step); break;
      case "download": downloads.push(await executeDownload(page, step)); break;
      default: throw new Error(`Runner does not execute ${step.type} steps`);
    }
    steps.push({ id:step.id, type:step.type, status:"completed" });
  }
  return { steps, downloads };
}
