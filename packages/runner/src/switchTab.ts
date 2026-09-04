import type { WorkflowStep } from "@web-agent/protocol";
import type { RunContext } from "./context.js";

export async function executeSwitchTab(context: RunContext, step: WorkflowStep): Promise<void> {
  const index = step.parameters?.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) throw new Error("SwitchTab steps require a non-negative tab index");
  const target = context.browserContext.pages()[index];
  if (!target) throw new Error(`Tab ${index} is unavailable`);
  await target.bringToFront();
  await target.waitForLoadState("domcontentloaded");
  context.currentPage = target;
}
