import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";

export async function executeNavigate(page: Page, step: WorkflowStep): Promise<void> {
  if (!step.url) throw new Error("Navigate steps require a URL");
  await page.goto(step.url, { waitUntil:"domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
}
