import { mkdir, writeFile } from "node:fs/promises";
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
