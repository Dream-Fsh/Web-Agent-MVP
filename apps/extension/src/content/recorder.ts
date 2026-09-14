import type { ElementSnapshot, RawEvent, RawEventType } from "@web-agent/protocol";
import { createCapturedEvent, recordCapturedEvent, type RecorderContext } from "@web-agent/recorder-core";

export interface DomRecorderOptions {
  context: RecorderContext;
  persist: (event: RawEvent) => void;
  now?: () => number;
  nextId?: () => string;
}

export interface ChromeRuntime { sendMessage: (message: { kind: "raw-event"; event: RawEvent }) => void }

export function createChromeSink(runtime: ChromeRuntime): (event: RawEvent) => void {
  return (event) => runtime.sendMessage({ kind: "raw-event", event });
}

const domEventTypes: Readonly<Record<string, RawEventType>> = {
  click: "click", dblclick: "dblclick", input: "input", change: "change", submit: "submit",
  focusin: "focus", contextmenu: "contextmenu", drop: "drag-drop", keydown: "keydown",
};

export function snapshot(element: Element): ElementSnapshot {
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
    if (event.composedPath().some(node => node instanceof Element && node.tagName.toLowerCase() === 'web-agent-recorder')) return;
    const type = domEventTypes[event.type];
    if (!type) return;
    if (event instanceof KeyboardEvent) {
      // Text is captured through input events; never persist raw printable keystrokes.
      const allowed = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      if (!allowed.includes(event.key)) return;
      emit(type, event.target, undefined, { key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey });
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'file') {
      if (type === 'change') emit('upload', target, undefined, { fileCount: target.files?.length ?? 0 });
      return;
    }
    const value = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? target.value : target instanceof HTMLElement && target.isContentEditable ? target.innerText : undefined;
    const metadata = target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(target.type) ? { checked: target.checked } : undefined;
    emit(type, target, value, metadata);
  };
  for (const type of Object.keys(domEventTypes)) document.addEventListener(type, handler, true);
  const pendingScrolls = new Map<EventTarget, ReturnType<typeof setTimeout>>();
  const flushScroll = (target: EventTarget) => {
    pendingScrolls.delete(target);
    const element = target instanceof Element ? target : document.scrollingElement;
    if (element) emit('scroll', target instanceof Element ? target : null, undefined, { x: element.scrollLeft, y: element.scrollTop });
  };
  const scroll = (event: Event) => {
    if (!event.target || event.composedPath().some(node => node instanceof Element && node.tagName.toLowerCase() === 'web-agent-recorder')) return;
    clearTimeout(pendingScrolls.get(event.target));
    pendingScrolls.set(event.target, setTimeout(() => flushScroll(event.target!), 150));
  };
  document.addEventListener('scroll', scroll, true);
  const flushPendingScrolls = () => { for (const [target, timer] of pendingScrolls) { clearTimeout(timer); flushScroll(target); } };
  window.addEventListener('pagehide', flushPendingScrolls);
  const navigation = () => emit("navigation", null, undefined, { navigationKind: "browser" });
  const spaNavigation = (event: Event) => {
    const detail = event instanceof CustomEvent && typeof event.detail === "object" && event.detail ? event.detail : {};
    emit("navigation", null, undefined, { navigationKind: "spa", ...detail });
  };
  window.addEventListener("popstate", navigation);
  window.addEventListener("hashchange", navigation);
  window.addEventListener("__web_agent_spa_navigation__", spaNavigation);
  const visibility = () => { if (document.visibilityState === "visible") emit("tab-change"); };
  document.addEventListener("visibilitychange", visibility);
  return () => { flushPendingScrolls(); window.removeEventListener('pagehide', flushPendingScrolls); document.removeEventListener('scroll', scroll, true); for (const type of Object.keys(domEventTypes)) document.removeEventListener(type, handler, true); window.removeEventListener("popstate", navigation); window.removeEventListener("hashchange", navigation); window.removeEventListener("__web_agent_spa_navigation__", spaNavigation); document.removeEventListener('visibilitychange', visibility); };
}
