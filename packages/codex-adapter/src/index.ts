import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWorkflow, type LocatorCandidate, type Workflow } from "@web-agent/protocol";
import { assertStepAllowed, redactWorkflow } from "@web-agent/safety";

type RepairOperation =
  | { type:"replaceLocator"; stepId:string; index:number; locator:LocatorCandidate }
  | { type:"addLocator"; stepId:string; locator:LocatorCandidate }
  | { type:"removeLocator"; stepId:string; index:number }
  | { type:"updateWaitCondition"; stepId:string; parameters:Record<string, unknown> };
export interface WorkflowRepairPatch { operations: RepairOperation[] }

export class RepairPatchRejectedError extends Error { public constructor(message: string) { super(message); this.name = "RepairPatchRejectedError"; } }

function stepFor(workflow: Workflow, stepId: string) {
  const step = workflow.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new RepairPatchRejectedError(`Unknown step: ${stepId}`);
  return step;
}

function isRepairOperation(value: unknown): value is RepairOperation {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  return ["replaceLocator", "addLocator", "removeLocator", "updateWaitCondition"].includes(value.type);
}

/** Applies the only four patch operations Codex is authorized to propose. */
export function applyRepairPatch(workflow: Workflow, patch: WorkflowRepairPatch): Workflow {
  const next = structuredClone(workflow) as Workflow;
  for (const operation of patch.operations as unknown[]) {
    if (!isRepairOperation(operation)) throw new RepairPatchRejectedError(`Forbidden repair operation: ${typeof operation === "object" && operation && "type" in operation ? String(operation.type) : "unknown"}`);
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
  catch (error) { throw new RepairPatchRejectedError(error instanceof Error ? error.message : "Safety validation failed"); }
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
export async function rollbackWorkflow(root: string, name: string, version: number): Promise<void> {
  const folder = join(root, safeName(name));
  const body = await readFile(join(folder, `v${version}.json`), "utf8");
  parseWorkflow(JSON.parse(body));
  await writeFile(join(folder, "current.json"), body, "utf8");
}
