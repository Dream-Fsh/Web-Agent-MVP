import type { WorkflowStep } from "@web-agent/protocol";
import type { RunContext } from "./context.js";

export async function executeSwitchTab(context: RunContext, step: WorkflowStep): Promise<void> {
  const index = step.parameters?.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) throw new Error('SwitchTab steps require a non-negative tab index');
  const recording = step.parameters?.scope === 'recording';
  if (recording && !context.recordingPages) throw new Error('Recorded tab identity is unavailable');
  if (!recording && !context.browserPages) throw new Error('Browser tab identity is unavailable');
  const pages = () => recording ? context.recordingPages! : context.browserPages!;
  let target = pages()[index];
  if (!target && recording) {
    try { await context.browserContext.waitForEvent('page', {predicate: () => Boolean(pages()[index]), timeout:5000}); }
    catch { throw new Error(`Recorded tab ${index} has not been created`); }
    target = pages()[index];
  }
  if (!target) throw new Error(`Tab ${index} is unavailable`);
  if (target.isClosed()) throw new Error(`Recorded tab ${index} is closed`);
  if (recording && index > 0 && context.recordingOwners) {
    const owner = await context.recordingOwners.get(target);
    if (!owner || !pages().includes(owner)) throw new Error(`Recorded tab ${index} has an unknown opener`);
  }
  await target.bringToFront();
  await target.waitForLoadState('domcontentloaded');
  if (target.isClosed()) throw new Error(`Recorded tab ${index} is closed`);
  context.currentPage = target;
}