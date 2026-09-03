import { parseRawEvent, type RawEvent } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";

export interface RawEventMessage { kind: "raw-event"; event: RawEvent }
export type ExtensionMessage = RawEventMessage;

/**
 * Background-side defense in depth. Task 06 supplies the actual persistence
 * adapter; this handler guarantees it can only receive sanitized protocol data.
 */
export function handleExtensionMessage(message: ExtensionMessage, persist: (event: RawEvent) => void): RawEvent {
  const event = parseRawEvent(redactRawEvent(message.event));
  persist(event);
  return event;
}
