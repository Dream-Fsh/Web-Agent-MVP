import { parseRawEvent, type RawEvent } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";

export interface RawEventMessage { kind: "raw-event"; event: RawEvent }
export type ExtensionMessage = RawEventMessage;
export interface ChromeMessageSender { frameId?: number }

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
