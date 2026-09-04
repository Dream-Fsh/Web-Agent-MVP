import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";

export async function executeDownload(context: RunContext, step: WorkflowStep): Promise<string> {
  if (!step.target) throw new Error("Download steps require a target");
  const target = await resolveTarget(context.currentPage, step.target);
  const pendingDownload = context.currentPage.waitForEvent("download");
  await target.locator.click();
  return (await pendingDownload).suggestedFilename();
}
