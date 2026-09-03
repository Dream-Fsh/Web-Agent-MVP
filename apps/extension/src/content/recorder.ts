import type { ElementSnapshot, RawEvent, RawEventType } from "@web-agent/protocol";
import { createCapturedEvent, recordCapturedEvent, type RecorderContext } from "@web-agent/recorder-core";

export interface DomRecorderOptions {
  context: RecorderContext;
  persist: (event: RawEvent) => void;
  now?: () => number;
  nextId?: () => string;
}

const domEventTypes: Readonly<Record<string, RawEventType>> = {
  click: "click", dblclick: "dblclick", input: "input", change: "change", submit: "submit",
};

function snapshot(element: Element): ElementSnapshot {
  const attributes = Object.fromEntries([...element.attributes]
    .filter((attribute) => attribute.name !== "value")
    .map((attribute) => [attribute.name, attribute.value]));
  return {
    tag: element.tagName.toLowerCase(), role: element.getAttribute("role") ?? undefined,
    text: element.textContent?.trim() || undefined, ariaLabel: element.getAttribute("aria-label") ?? undefined,
    accessibleName: element.getAttribute("aria-label") ?? (element.textContent?.trim() || undefined),
    label: element.getAttribute("aria-label") ?? undefined, placeholder: element.getAttribute("placeholder") ?? undefined,
    testId: element.getAttribute("data-testid") ?? undefined, attributes, nearbyText: [], locatorCandidates: [],
  };
}

export function startDomRecorder(document: Document, options: DomRecorderOptions): () => void {
  const now = options.now ?? Date.now;
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const emit = (type: RawEventType, target?: EventTarget | null, value?: string, metadata?: Record<string, unknown>) => {
    const element = target instanceof Element ? snapshot(target) : undefined;
    const event = createCapturedEvent({ ...options.context, url: document.location.href }, { id: nextId(), timestamp: now(), type, element, value, metadata });
    recordCapturedEvent(event, options.persist);
  };
  const handler = (event: Event) => {
    const type = domEventTypes[event.type];
    if (!type) return;
    const value = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ? event.target.value : undefined;
    emit(type, event.target, value);
  };
  for (const type of Object.keys(domEventTypes)) document.addEventListener(type, handler, true);
  const navigation = () => emit("navigation", null, undefined, { navigationKind: "browser" });
  const spaNavigation = (event: Event) => {
    const detail = event instanceof CustomEvent && typeof event.detail === "object" && event.detail ? event.detail : {};
    emit("navigation", null, undefined, { navigationKind: "spa", ...detail });
  };
  window.addEventListener("popstate", navigation);
  window.addEventListener("hashchange", navigation);
  window.addEventListener("__web_agent_spa_navigation__", spaNavigation);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") emit("tab-change"); });
  return () => { for (const type of Object.keys(domEventTypes)) document.removeEventListener(type, handler, true); window.removeEventListener("popstate", navigation); window.removeEventListener("hashchange", navigation); window.removeEventListener("__web_agent_spa_navigation__", spaNavigation); };
}
