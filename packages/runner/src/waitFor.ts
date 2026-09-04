import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";

export async function executeWaitFor(context: RunContext, step: WorkflowStep): Promise<void> {
  if (step.url) { await context.currentPage.waitForURL(step.url); return; }
  if (!step.target) throw new Error("WaitFor steps require a target or URL");
  const target = await resolveTarget(context.currentPage, step.target);
  await target.locator.waitFor({ state:"visible" });
}
