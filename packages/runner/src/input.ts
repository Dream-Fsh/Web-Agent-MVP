import {stepScope} from './frame.js';
import type { WorkflowStep } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";
import type { RunContext } from "./context.js";

export async function executeInput(context: RunContext, step: WorkflowStep): Promise<void> {
  if (!step.target) throw new Error("Input steps require a target");
  const value = step.parameters?.value;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Input steps require a string or number value");
  const target = await resolveTarget(await stepScope(context,step), step.target);
  await target.locator.fill(String(value));
}
