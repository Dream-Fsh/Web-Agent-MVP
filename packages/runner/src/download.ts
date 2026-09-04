import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export async function executeDownload(page: Page, step: WorkflowStep): Promise<string> {
  if (!step.target) throw new Error("Download steps require a target");
  const target = await resolveTarget(page, step.target);
  const pendingDownload = page.waitForEvent("download");
  await target.locator.click();
  return (await pendingDownload).suggestedFilename();
}
