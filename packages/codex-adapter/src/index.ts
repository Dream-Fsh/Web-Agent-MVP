import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseWorkflow, type LocatorCandidate, type Workflow } from "@web-agent/protocol";
import { assertStepAllowed, redactWorkflow } from "@web-agent/safety";

const locatorCandidateSchema = z.object({
  strategy:z.enum(["testId", "role", "label", "placeholder", "attribute", "text", "css"]),
  value:z.string().min(1),
  score:z.number().min(0).max(1),
}).strict();

const repairOperationSchema = z.discriminatedUnion("type", [
  z.object({ type:z.literal("replaceLocator"), stepId:z.string().min(1), index:z.number().int().nonnegative(), locator:locatorCandidateSchema }).strict(),
  z.object({ type:z.literal("addLocator"), stepId:z.string().min(1), locator:locatorCandidateSchema }).strict(),
  z.object({ type:z.literal("removeLocator"), stepId:z.string().min(1), index:z.number().int().nonnegative() }).strict(),
  z.object({ type:z.literal("updateWaitCondition"), stepId:z.string().min(1), parameters:z.record(z.string(), z.unknown()) }).strict(),
]);

export const workflowRepairPatchSchema = z.object({
  workflowId:z.string().min(1),
  baseVersion:z.number().int().positive(),
  reason:z.string().min(1),
  confidence:z.number().min(0).max(1),
  operations:z.array(repairOperationSchema).min(1),
}).strict();

type RepairOperation = z.infer<typeof repairOperationSchema>;
export type WorkflowRepairPatch = z.infer<typeof workflowRepairPatchSchema>;

export class RepairPatchRejectedError extends Error {
  public constructor(message: string, public readonly code:"STALE_PATCH" | "INVALID_PATCH" | "REPLAY_FAILED" | "SAFETY_REJECTED" = "INVALID_PATCH") {
    super(message);
    this.name = "RepairPatchRejectedError";
  }
}

function stepFor(workflow: Workflow, stepId: string) {
  const step = workflow.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new RepairPatchRejectedError(`Unknown step: ${stepId}`);
  return step;
}

/** Applies the only four patch operations Codex is authorized to propose. */
export function applyRepairPatch(workflow: Workflow, input: unknown): Workflow {
  const parsed = workflowRepairPatchSchema.safeParse(input);
  if (!parsed.success) throw new RepairPatchRejectedError("Repair patch failed schema validation", "INVALID_PATCH");
  const patch = parsed.data;
  if (patch.workflowId !== workflow.id || patch.baseVersion !== workflow.version) {
    throw new RepairPatchRejectedError("Patch workflow identity or base version is stale", "STALE_PATCH");
  }
  const next = structuredClone(workflow) as Workflow;
  for (const operation of patch.operations) {
    const step = stepFor(next, operation.stepId);
    if (operation.type === "updateWaitCondition") {
      if (step.type !== "waitFor") throw new RepairPatchRejectedError("Wait conditions can only be updated on waitFor steps");
      step.parameters = operation.parameters;
      continue;
    }
    if (!step.target) throw new RepairPatchRejectedError(`Step ${step.id} has no target to repair`);
    if (operation.type === "addLocator") step.target.locators.push(operation.locator);
    if (operation.type === "replaceLocator") {
      if (!step.target.locators[operation.index]) throw new RepairPatchRejectedError("Locator index is unavailable");
      step.target.locators[operation.index] = operation.locator;
    }
    if (operation.type === "removeLocator") {
      if (step.target.locators.length === 1) throw new RepairPatchRejectedError("A target must retain at least one locator");
      step.target.locators.splice(operation.index, 1);
    }
  }
  const validated = parseWorkflow(next);
  try { for (const step of validated.steps) assertStepAllowed(step); }
  catch (error) { throw new RepairPatchRejectedError(error instanceof Error ? error.message : "Safety validation failed", "SAFETY_REJECTED"); }
  return validated;
}

function safeName(name: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) throw new Error("Workflow name must be a safe path segment"); return name; }
export async function saveWorkflowVersion(root: string, name: string, workflow: Workflow): Promise<string> {
  const validated = parseWorkflow(redactWorkflow(workflow));
  const folder = join(root, safeName(name));
  await mkdir(folder, { recursive:true });
  const versionPath = join(folder, `v${validated.version}.json`);
  const body = `${JSON.stringify(validated, null, 2)}\n`;
  await writeFile(versionPath, body, { encoding:"utf8", flag:"wx" });
  await writeFile(join(folder, "current.json"), body, "utf8");
  return versionPath;
}

export interface RepairReplayResult { requiredAssertionsPassed: boolean }
export type RepairReplay = (workflow: Workflow) => Promise<RepairReplayResult>;

/** Promotes a temporary patch only after replay passes every required assertion. */
export async function promoteRepairPatch(root: string, name: string, workflow: Workflow, patch: unknown, replay: RepairReplay): Promise<Workflow> {
  const temporary = applyRepairPatch(workflow, patch);
  const replayResult = await replay(temporary);
  if (!replayResult.requiredAssertionsPassed) {
    throw new RepairPatchRejectedError("Repair replay did not pass every required assertion", "REPLAY_FAILED");
  }
  const promoted: Workflow = {
    ...temporary,
    version:workflow.version + 1,
    metadata:{ ...temporary.metadata, updatedAt:new Date().toISOString() },
  };
  await saveWorkflowVersion(root, name, promoted);
  return promoted;
}
export async function rollbackWorkflow(root: string, name: string, version: number): Promise<void> {
  const folder = join(root, safeName(name));
  const body = await readFile(join(folder, `v${version}.json`), "utf8");
  parseWorkflow(JSON.parse(body));
  await writeFile(join(folder, "current.json"), body, "utf8");
}
