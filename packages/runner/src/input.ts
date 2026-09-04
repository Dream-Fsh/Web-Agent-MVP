import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export async function executeInput(page: Page, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Input steps require a target");
  const value = step.parameters?.value;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Input steps require a string or number value");
  const target = await resolveTarget(page, step.target);
  await target.locator.fill(String(value));
}
