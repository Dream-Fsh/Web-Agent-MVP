import type { WorkflowStep } from "@web-agent/protocol";
import type { RunContext } from "./context.js";

export async function executeSwitchTab(context: RunContext, step: WorkflowStep): Promise<void> {
  const index = step.parameters?.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) throw new Error("SwitchTab steps require a non-negative tab index");
  const pages=()=>step.parameters?.scope==='recording' && context.recordingStartPage
    ?[context.recordingStartPage,...context.browserContext.pages().filter(page=>!context.existingPages?.includes(page))]
    :context.browserContext.pages();
  let target=pages()[index];
  if(!target && step.parameters?.scope==='recording'){
    await context.browserContext.waitForEvent('page',{predicate:()=>Boolean(pages()[index]),timeout:5000});target=pages()[index];
  }
  if (!target) throw new Error(`Tab ${index} is unavailable`);
  await target.bringToFront();
  await target.waitForLoadState("domcontentloaded");
  context.currentPage = target;
}
