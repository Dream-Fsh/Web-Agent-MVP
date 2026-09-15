import {stepScope} from './frame.js';
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";
import {withValidatedTarget} from './validated-target.js';

export async function executeClick(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Click steps require a target");
  if(context.validateTarget)return withValidatedTarget(context,step,element=>element.click());
  const target = await resolveTarget(await stepScope(context,step), step.target);
  await target.locator.click();
}
