import type { Page } from "@playwright/test";
import type { WorkflowStep } from "@web-agent/protocol";

export async function executeSwitchTab(page: Page, step: WorkflowStep): Promise<void> {
  const index = step.parameters?.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) throw new Error("SwitchTab steps require a non-negative tab index");
  const target = page.context().pages()[index];
  if (!target) throw new Error(`Tab ${index} is unavailable`);
  await target.bringToFront();
  await target.waitForLoadState("domcontentloaded");
}
