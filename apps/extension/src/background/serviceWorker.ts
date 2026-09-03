import { parseRawEvent, type RawEvent } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";

export interface RawEventMessage { kind: "raw-event"; event: RawEvent }
export type ExtensionMessage = RawEventMessage;
export interface ChromeMessageSender { frameId?: number }
export interface ChromeRuntimePort {
  onMessage: { addListener: (listener: (message: unknown, sender: ChromeMessageSender) => void) => void }
}

/**
 * Background-side defense in depth. Task 06 supplies the actual persistence
 * adapter; this handler guarantees it can only receive sanitized protocol data.
 */
export function handleExtensionMessage(message: ExtensionMessage, persist: (event: RawEvent) => void, sender: ChromeMessageSender = {}): RawEvent {
  const candidate = sender.frameId === undefined ? message.event : { ...message.event, frame: { ...message.event.frame, frameId: sender.frameId } };
  const event = parseRawEvent(redactRawEvent(candidate));
  persist(event);
  return event;
}

function isRawEventMessage(message: unknown): message is RawEventMessage {
  return typeof message === "object" && message !== null && (message as { kind?: unknown }).kind === "raw-event" && "event" in message;
}

export function registerRuntimeListener(runtime: ChromeRuntimePort, persist: (event: RawEvent) => void): void {
  runtime.onMessage.addListener((message, sender) => {
    if (isRawEventMessage(message)) handleExtensionMessage(message, persist, sender);
  });
}
