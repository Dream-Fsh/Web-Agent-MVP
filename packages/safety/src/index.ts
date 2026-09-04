import type { RawEvent, WorkflowStep } from "@web-agent/protocol";

export type RiskLevel = "safe" | "write" | "destructive";
export interface SafetyPolicy { mode?: "read-only" | "allow-writes" }
export const REDACTED = "[REDACTED]";

const sensitiveKey = /password|authorization|cookie|token|access_token|refresh_token|prompt|filename/i;
const destructive = /删除|支付|永久关闭|delete|pay|permanently close/i;
const write = /保存|编辑|创建|修改预算|提交|启用|暂停广告|save|edit|create|submit|enable|pause/i;

function redactValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return REDACTED;
  if (typeof value === "string" && /(?:password|authorization|cookie|token|access_token|refresh_token)\s*[=:]/i.test(value)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
  return value;
}

/** Redacts structured diagnostic data before it can be persisted or exported. */
export function redactSensitiveData<T>(value: T): T { return redactValue(value) as T; }

export function redactRawEvent(event: RawEvent): RawEvent {
  const element = event.element ? { ...event.element, attributes: redactValue(event.element.attributes) as Record<string, string> } : undefined;
  const inputType = element?.attributes.type?.toLowerCase();
  const sensitiveInput = inputType === "password" || inputType === "hidden" || Boolean(element && sensitiveKey.test(`${element.attributes.name ?? ""} ${element.attributes.id ?? ""}`));
  const url = new URL(event.url);
  url.search = "";
  return { ...event, url: url.toString().replace(/\?$/, ""), element, value: sensitiveInput || event.type === "upload" ? REDACTED : event.value, metadata: redactValue(event.metadata) as Record<string, unknown> | undefined };
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
