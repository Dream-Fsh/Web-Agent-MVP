import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export async function executeClick(page: Page, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Click steps require a target");
  const target = await resolveTarget(page, step.target);
  await target.locator.click();
}
