import type { RawEvent, Workflow, WorkflowStep } from "@web-agent/protocol";

export type RiskLevel = "safe" | "write" | "destructive";
export interface SafetyPolicy { mode?: "read-only" | "allow-writes" }
export const REDACTED = "[REDACTED]";

const sensitiveKey = /password|authorization|cookie|token|access_token|refresh_token|prompt|filename/i;
const urlKey = /url$/i;
const destructive = /删除|支付|永久关闭|delete|pay|permanently close/i;
const write = /保存|编辑|创建|修改预算|提交|启用|暂停广告|save|edit|create|submit|enable|pause/i;

function redactValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return REDACTED;
  if (urlKey.test(key) && typeof value === "string") return redactUrl(value);
  if (typeof value === "string" && /(?:password|authorization|cookie|token|access_token|refresh_token)\s*[=:]/i.test(value)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
  return value;
}

/** Redacts structured diagnostic data before it can be persisted or exported. */
export function redactSensitiveData<T>(value: T): T { return redactValue(value) as T; }

/** Removes a URL query before URLs cross a persistence or diagnostic boundary. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    return url.toString().replace(/\?$/, "");
  } catch {
    return REDACTED;
  }
}

export function redactRawEvent(event: RawEvent): RawEvent {
  const element = event.element ? { ...event.element, attributes: redactValue(event.element.attributes) as Record<string, string> } : undefined;
  const inputType = element?.attributes.type?.toLowerCase();
  const sensitiveInput = inputType === "password" || inputType === "hidden" || Boolean(element && sensitiveKey.test(`${element.attributes.name ?? ""} ${element.attributes.id ?? ""}`));
  return {
    ...event,
    url: redactUrl(event.url),
    frame:{ ...event.frame, frameUrl:event.frame.frameUrl ? redactUrl(event.frame.frameUrl) : undefined },
    element,
    value: sensitiveInput || event.type === "upload" ? REDACTED : event.value,
    metadata: redactValue(event.metadata) as Record<string, unknown> | undefined,
  };
}

/** Redacts all protocol URL fields before a Workflow becomes persisted evidence. */
export function redactWorkflow(workflow: Workflow): Workflow {
  return {
    ...redactSensitiveData(workflow),
    startUrl:redactUrl(workflow.startUrl),
    steps:workflow.steps.map((step) => ({ ...redactSensitiveData(step), url:step.url ? redactUrl(step.url) : undefined })),
  };
}

export type ScreenshotSanitizer = (screenshot: Uint8Array) => Promise<Uint8Array | undefined>;

/**
 * Screenshot bytes are untrusted evidence. Without an explicit sanitizer the
 * safe outcome is omission, never a raw persistence write.
 */
export async function sanitizeScreenshot(screenshot: Uint8Array, sanitizer?: ScreenshotSanitizer): Promise<Uint8Array | undefined> {
  return sanitizer ? sanitizer(screenshot) : undefined;
}

function stepText(step: WorkflowStep): string {
  return [step.target?.fingerprint.text, step.target?.fingerprint.role, ...((step.target?.locators ?? []).map((locator) => locator.value))].filter(Boolean).join(" ");
}

export function classifyStep(step: WorkflowStep): RiskLevel {
  const text = stepText(step);
  if (destructive.test(text)) return "destructive";
  if (write.test(text)) return "write";
  return "safe";
}

export class UnsafeActionBlockedError extends Error {
  public constructor(public readonly risk: RiskLevel) { super(`Unsafe ${risk} action blocked`); this.name = "UnsafeActionBlockedError"; }
}

export function assertStepAllowed(step: WorkflowStep, policy: SafetyPolicy = { mode: "read-only" }): void {
  const risk = classifyStep(step);
  if (risk === "destructive" || (risk === "write" && (policy.mode ?? "read-only") === "read-only")) throw new UnsafeActionBlockedError(risk);
}
