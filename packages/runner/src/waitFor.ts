import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export async function executeWaitFor(page: Page, step: WorkflowStep): Promise<void> {
  if (step.url) { await page.waitForURL(step.url); return; }
  if (!step.target) throw new Error("WaitFor steps require a target or URL");
  const target = await resolveTarget(page, step.target);
  await target.locator.waitFor({ state:"visible" });
}
