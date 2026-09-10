import {stepScope} from './frame.js';
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";

export async function executeSelect(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Select steps require a target");
  const value = step.parameters?.value;
  if (typeof value !== "string") throw new Error("Select steps require a string value");
  const target = await resolveTarget(await stepScope(context,step), step.target);
  await target.locator.selectOption(value);
}
