import type { RawEvent, Workflow, WorkflowStep } from "@web-agent/protocol";

export type RiskLevel = "safe" | "write" | "destructive" | "unknown";
export interface RiskAssessment { risk: RiskLevel; reason: string }
export interface SafetyPolicy { mode?: "read-only" | "allow-writes"; allowedOrigins?: string[] }
export const REDACTED = "[REDACTED]";

const sensitiveKey = /password|authorization|cookie|token|access_token|refresh_token|prompt|filename/i;
const urlKey = /(?:url$|^(?:href|src|action|formaction|poster|cite|background|xlink:href)$)/i;
const destructive = /删除|支付|永久关闭|delete|pay|permanently close/i;
const write = /保存|编辑|创建|修改预算|提交|启用|暂停广告|save|edit|create|submit|enable|pause/i;

function redactValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return REDACTED;
  if (urlKey.test(key) && typeof value === "string") return redactUrl(redactUrlText(redactUrl(value)));
  if (typeof value === "string" && /(?:password|authorization|cookie|token|access_token|refresh_token)\s*[=:]/i.test(value)) return REDACTED;
  if (typeof value === 'string') return redactUrlText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
  return value;
}

/** Redacts structured diagnostic data before it can be persisted or exported. */
export function redactSensitiveData<T>(value: T): T { return redactValue(value) as T; }

/** URL candidates in prose have lexical boundaries, unlike a structured URL field.
 * Consume userinfo through its @ before treating parentheses as prose boundaries.
 * A slash ends the authority; Markdown's next URL therefore cannot be swallowed.
 * TAB/CR/LF inside userinfo belong to the same candidate (WHATWG).
 * Ambiguous backslash authorities fail closed instead of becoming secret paths.
 */
export function redactUrlText(text: string): string {
  const candidates = /(?:https?(?::|%3a))?(?:[\/\\]|%2f|%5c){2}(?:[^ "'<>\/]*?(?:@|%40))?[^\s"'<>()[\]{}，。；]*/gi;
  return text.replace(candidates, candidate => {
    let value = candidate;
    // Decode an encoded URL envelope, not arbitrary surrounding prose or paths.
    for (let i = 0; i < 2 && /^(?:https?%3a|%2f%2f|%5c%5c)/i.test(value); i++) {
      try { value = decodeURIComponent(value); } catch { return REDACTED; }
    }
    if (value.includes('@') && value.includes('\\')) return REDACTED;
    const clean = redactUrl(value);
    // Normal non-sensitive URLs retain their spelling; credential/query-bearing
    // or malformed candidates always use the sanitized reconstruction.
    try {
      const parsed = new URL(value, 'https://redaction.invalid/');
      if (!parsed.username && !parsed.password && !parsed.search && (!parsed.hash || /^#[A-Za-z0-9/_-]+$/.test(parsed.hash)) && !/[\u0000-\u001f\\]/.test(value) && clean !== REDACTED) return value;
    } catch { return REDACTED; }
    return clean;
  });
}

/** Removes a URL query before URLs cross a persistence or diagnostic boundary. */
export function redactUrl(value: string): string {
  try {
    // Resolve relative attributes only for parsing, then preserve their relative form.
    // WHATWG strips leading/trailing C0 or space and removes TAB/LF/CR.
    // Classify exactly the same normalized string that we parse and reconstruct.
    value = value.trim().replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
      .replace(/[\t\r\n]/g, '').replace(/\\/g, '/');
    if (/[\u0000-\u001f]/.test(value)) return REDACTED;
    const base = 'https://redaction.invalid/';
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    // An embedded absolute URL is not a supported relative path (e.g. pasted Markdown).
    if (!absolute && /[a-z][a-z0-9+.-]*:\/\//i.test(value.split(/[?#]/, 1)[0])) return REDACTED;
    const url = absolute ? new URL(value) : new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return REDACTED;
    url.username = ''; url.password = ''; url.search = '';
    if (!/^#[A-Za-z0-9/_-]+$/.test(url.hash)) url.hash = '';
    if (absolute) return url.href;
    if (value.startsWith('//')) return '//' + url.host + url.pathname + url.hash;
    // Only a genuinely relative URL may retain its normalized path spelling.
    // Never reconstruct an authority from untrusted original text.
    if (url.origin !== new URL(base).origin) return REDACTED;
    // Preserve ./ and ../ semantics without emitting the parsing-only base.
    return value.split(/[?#]/, 1)[0] + url.hash;
  } catch { return REDACTED; }
}

export function assertOriginAllowed(value:string,startUrl:string,policy:SafetyPolicy):void {
  let destination:URL,start:URL;
  try {destination=new URL(value);start=new URL(startUrl);} catch {throw new UnsafeActionBlockedError('unknown','navigation URL is invalid');}
  if(!['http:','https:'].includes(destination.protocol)||destination.username||destination.password)throw new UnsafeActionBlockedError('unknown','navigation URL is unsafe');
  if(destination.origin!==start.origin&&!isAllowedOrigin(destination,policy.allowedOrigins??[]))throw new UnsafeActionBlockedError('unknown','cross-origin navigation is not allowlisted');
}
export function redactRawEvent(event: RawEvent): RawEvent {
  const element = event.element ? redactValue(event.element) as RawEvent['element'] : undefined;
  const inputType = element?.attributes.type?.toLowerCase();
  const sensitiveInput = inputType === "password" || inputType === "hidden" || Boolean(element && sensitiveKey.test(`${element.attributes.name ?? ""} ${element.attributes.id ?? ""}`));
  return {
    ...event,
    url: redactUrl(event.url),
    frame:{ ...event.frame, frameUrl:event.frame.frameUrl ? redactUrl(event.frame.frameUrl) : undefined },
    element,
    value: sensitiveInput || event.type === "upload" ? REDACTED : redactValue(event.value) as string | undefined,
    metadata: redactValue(event.metadata) as Record<string, unknown> | undefined,
  };
}

/** Redacts all protocol URL fields before a Workflow becomes persisted evidence. */
export function redactWorkflow(workflow: Workflow): Workflow {
  return {
    ...redactSensitiveData(workflow),
    // Variable names are schema keys, not secret payloads. Preserve their flags;
    // only non-sensitive defaults may cross this persistence boundary.
    variables:Object.fromEntries(Object.entries(workflow.variables).map(([name, definition]) => {
      const {defaultValue, ...flags} = definition;
      return [name, {...flags, ...(defaultValue !== undefined && !definition.sensitive && !sensitiveKey.test(name)
        ? {defaultValue:redactSensitiveData(defaultValue)} : {})}];
    })),
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

const readOnlyStepTypes: ReadonlySet<WorkflowStep["type"]> = new Set(["navigate", "waitFor", "switchTab", "extract", "assert", "download"]);
const readOnlyInteraction = /查询|搜索|筛选|查看|关闭|账户|下一页|上一页|search|filter|view|close|account|next|previous/i;

/** Assesses risk explicitly; legacy keyword rules remain only as a fallback signal. */
export function assessStepRisk(step: WorkflowStep): RiskAssessment {
  const text = stepText(step);
  if (destructive.test(text)) return { risk:"destructive", reason:"destructive keyword fallback" };
  if (write.test(text)) return { risk:"write", reason:"write keyword fallback" };
  if (readOnlyStepTypes.has(step.type)) return { risk:"safe", reason:`${step.type} is a read-only workflow operation` };
  if (readOnlyInteraction.test(text)) return { risk:"safe", reason:"recognized read-only interaction" };
  return { risk:"unknown", reason:"no explicit safe action classification" };
}

export function classifyStep(step: WorkflowStep): RiskLevel {
  return assessStepRisk(step).risk;
}

export class UnsafeActionBlockedError extends Error {
  public constructor(public readonly risk: RiskLevel, reason?: string) { super(`Unsafe ${risk} action blocked${reason ? `: ${reason}` : ""}`); this.name = "UnsafeActionBlockedError"; }
}

function isAllowedOrigin(destination: URL, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((origin) => {
    try { return new URL(origin).origin === destination.origin; }
    catch { return false; }
  });
}

export function assertStepAllowed(step: WorkflowStep, policy: SafetyPolicy = { mode: "read-only" }, startUrl?: string): void {
  const assessment = assessStepRisk(step);
  if (assessment.risk === "destructive") throw new UnsafeActionBlockedError(assessment.risk, assessment.reason);
  if ((policy.mode ?? "read-only") === "read-only" && assessment.risk !== "safe") throw new UnsafeActionBlockedError(assessment.risk, assessment.reason);
  if (step.type === "navigate" && step.url && startUrl) {
    let destination: URL;
    let start: URL;
    try { destination = new URL(step.url); start = new URL(startUrl); }
    catch { throw new UnsafeActionBlockedError("unknown", "navigation URL is invalid"); }
    if (destination.origin !== start.origin && !isAllowedOrigin(destination, policy.allowedOrigins ?? [])) {
      throw new UnsafeActionBlockedError("unknown", "cross-origin navigation is not allowlisted");
    }
  }
}
