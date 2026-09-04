import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export async function executeSelect(page: Page, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Select steps require a target");
  const value = step.parameters?.value;
  if (typeof value !== "string") throw new Error("Select steps require a string value");
  const target = await resolveTarget(page, step.target);
  await target.locator.selectOption(value);
}
