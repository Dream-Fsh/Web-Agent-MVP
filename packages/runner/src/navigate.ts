import type { WorkflowStep } from "@web-agent/protocol";
import type { RunContext } from "./context.js";

export async function executeNavigate(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.url) throw new Error("Navigate steps require a URL");
  await context.currentPage.goto(step.url, { waitUntil:"domcontentloaded" });
  await context.currentPage.waitForLoadState("domcontentloaded");
}
