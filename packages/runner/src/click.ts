import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";

export async function executeClick(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Click steps require a target");
  const target = await resolveTarget(context.currentPage, step.target);
  await target.locator.click();
}
