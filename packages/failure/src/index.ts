import { mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { redactSensitiveData, sanitizeScreenshot, type ScreenshotSanitizer } from "@web-agent/safety";

export interface FailurePackageInput {
  runId: string;
  stepId: string;
  error: unknown;
  domContext: { nearbyText: string[]; structure: string[] };
  target: unknown;
  workflow: unknown;
  fullHtml?: string;
  screenshot?: Uint8Array;
  sanitizeScreenshot?: ScreenshotSanitizer;
  trace?: Uint8Array;
}

export interface StoredFailure {runId:string;stepId:string;workflowId:string;reason:string;createdAt:string;workflow:unknown;target:unknown;domContext:{nearbyText:string[];structure:string[]}}
async function readBoundedJson(path:string):Promise<unknown> {
  if ((await stat(path)).size > 1024*1024) throw new Error('Failure evidence exceeds limit');
  return JSON.parse(await readFile(path,'utf8'));
}
async function readFailureStep(root:string,runId:string,stepId:string):Promise<StoredFailure> {
  const directory=join(root,safeSegment(runId,'runId'),safeSegment(stepId,'stepId'));
  const failure=await readBoundedJson(join(directory,'failure.json')) as {error:unknown};
  const workflow=await readBoundedJson(join(directory,'workflow.snapshot.json')) as {id?:string};
  return redactSensitiveData({runId,stepId,workflowId:workflow.id ?? 'unknown',reason:typeof failure.error==='string'?failure.error:JSON.stringify(failure.error),createdAt:(await stat(join(directory,'failure.json'))).mtime.toISOString(),workflow,target:await readBoundedJson(join(directory,'target.json')),domContext:await readBoundedJson(join(directory,'dom-context.json')) as StoredFailure['domContext']});
}
export async function listFailurePackages(root:string):Promise<StoredFailure[]> {
  let runs;
  try {runs=await readdir(root,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  const results:StoredFailure[]=[];
  for(const run of runs.filter(entry=>entry.isDirectory())) {
    for(const step of (await readdir(join(root,run.name),{withFileTypes:true})).filter(entry=>entry.isDirectory())) results.push(await readFailureStep(root,run.name,step.name));
  }
  return results.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function readFailurePackage(root:string,runId:string):Promise<StoredFailure> {
  safeSegment(runId,'runId');
  const steps=(await readdir(join(root,runId),{withFileTypes:true})).filter(entry=>entry.isDirectory());
  if(steps.length!==1)throw new Error('Expected exactly one failed step in run');
  return readFailureStep(root,runId,steps[0].name);
}

function safeSegment(value: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new Error(`${name} must be a safe path segment`);
  return value;
}

/** Persists redacted failure evidence without copying full-page HTML. */
export async function saveFailurePackage(input: FailurePackageInput, failuresRoot: string): Promise<string> {
  const location = join(failuresRoot, safeSegment(input.runId, "runId"), safeSegment(input.stepId, "stepId"));
  await mkdir(location, { recursive:true });
  const screenshot = input.screenshot ? await sanitizeScreenshot(input.screenshot, input.sanitizeScreenshot) : undefined;
  const screenshotStatus = input.screenshot ? (screenshot ? "sanitized" : "omitted-unsanitized") : "not-provided";
  await Promise.all([
    writeFile(join(location, "failure.json"), `${JSON.stringify({ error:redactSensitiveData(input.error), screenshotStatus })}\n`, "utf8"),
    writeFile(join(location, "dom-context.json"), `${JSON.stringify(redactSensitiveData({ nearbyText:input.domContext.nearbyText, structure:input.domContext.structure }))}\n`, "utf8"),
    writeFile(join(location, "target.json"), `${JSON.stringify(redactSensitiveData(input.target))}\n`, "utf8"),
    writeFile(join(location, "workflow.snapshot.json"), `${JSON.stringify(redactSensitiveData(input.workflow))}\n`, "utf8"),
    writeFile(join(location, "trace.zip"), input.trace ?? new Uint8Array()),
    ...(screenshot ? [writeFile(join(location, "screenshot.png"), screenshot)] : []),
  ]);
  return location;
}
