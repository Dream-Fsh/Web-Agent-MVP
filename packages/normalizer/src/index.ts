import type { ElementSnapshot, RawEvent } from "@web-agent/protocol";

export type NormalizedActionType = "navigate" | "click" | "input" | "submit" | "switchTab" | "upload" | "drag-drop";

export interface ActionContext {
  sessionId: string;
  tabId?: number;
  frame: RawEvent["frame"];
}

export interface NormalizedAction {
  id: string;
  type: NormalizedActionType;
  timestamp: number;
  url: string;
  context: ActionContext;
  element?: ElementSnapshot;
  value?: string;
  metadata?: { navigationKind?: "browser" | "spa" };
  sourceEventIds: string[];
}

export interface NormalizerOptions {
  inputMergeWindowMs?: number;
  duplicateClickWindowMs?: number;
  navigationMergeWindowMs?: number;
}

const defaultOptions: Required<NormalizerOptions> = {
  inputMergeWindowMs: 1_000,
  duplicateClickWindowMs: 500,
  navigationMergeWindowMs: 1_000,
};

function tabId(event: RawEvent): number | undefined {
  const value = event.metadata?.tabId;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function contextFor(event: RawEvent): ActionContext {
  const currentTabId = tabId(event);
  return { sessionId:event.sessionId, ...(currentTabId === undefined ? {} : { tabId:currentTabId }), frame:event.frame };
}

function contextKey(context: ActionContext): string {
  return JSON.stringify(context);
}

function targetKey(element: ElementSnapshot | undefined): string | undefined {
  if (!element) return undefined;
  const value = element.testId ?? element.attributes["data-testid"] ?? element.attributes.id ?? element.attributes.name ?? element.ariaLabel ?? element.accessibleName ?? element.label ?? element.placeholder ?? element.text?.trim();
  return value ? `${element.tag}:${value}` : undefined;
}

function toAction(event: RawEvent): NormalizedAction {
  const type: NormalizedActionType = event.type === "navigation" ? "navigate"
    : event.type === "tab-change" ? "switchTab"
    : event.type === "change" ? "input"
    : event.type === "dblclick" ? "click"
    : event.type;
  const navigationKind = event.metadata?.navigationKind;
  return {
    id:event.id, type, timestamp:event.timestamp, url:event.url, context:contextFor(event), element:event.element, value:event.value,
    ...(navigationKind === "browser" || navigationKind === "spa" ? { metadata:{ navigationKind } } : {}), sourceEventIds:[event.id],
  };
}

function needsTarget(event: RawEvent): boolean {
  return event.type === "click" || event.type === "dblclick" || event.type === "input" || event.type === "change" || event.type === "upload" || event.type === "drag-drop";
}

function matchesContextAndTarget(left: NormalizedAction, right: NormalizedAction): boolean {
  return contextKey(left.context) === contextKey(right.context) && targetKey(left.element) === targetKey(right.element);
}

/**
 * Converts only protocol-owned RawEvents into replay-oriented actions. No
 * source-project recording/session type is imported or exposed here.
 */
export function normalizeEvents(events: RawEvent[], options: NormalizerOptions = {}): NormalizedAction[] {
  const settings = { ...defaultOptions, ...options };
  const output: NormalizedAction[] = [];

  for (const event of [...events].sort((left, right) => left.timestamp - right.timestamp)) {
    if (needsTarget(event) && !targetKey(event.element)) continue;
    const action = toAction(event);
    const previous = output.at(-1);
    if (!previous) { output.push(action); continue; }

    const elapsed = action.timestamp - previous.timestamp;
    if (action.type === "input" && previous.type === "input" && elapsed <= settings.inputMergeWindowMs && matchesContextAndTarget(previous, action)) {
      previous.value = action.value ?? previous.value;
      previous.element = action.element ?? previous.element;
      previous.sourceEventIds.push(...action.sourceEventIds);
      continue;
    }
    if (action.type === "click" && previous.type === "click" && elapsed <= settings.duplicateClickWindowMs && action.url === previous.url && matchesContextAndTarget(previous, action)) {
      continue;
    }
    if (action.type === "navigate" && previous.type === "navigate" && elapsed <= settings.navigationMergeWindowMs && action.url === previous.url && contextKey(action.context) === contextKey(previous.context)) {
      previous.metadata = action.metadata ?? previous.metadata;
      previous.sourceEventIds.push(...action.sourceEventIds);
      continue;
    }
    output.push(action);
  }
  return output;
}
