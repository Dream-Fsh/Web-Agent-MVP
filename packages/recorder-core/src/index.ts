import { parseRawEvent, type RawEvent } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";

/**
 * Recorder-owned capture input. It deliberately aliases our protocol instead
 * of importing a source recorder session/action type.
 */
export type CapturedEvent = RawEvent;
export type RawEventSink = (event: RawEvent) => void;

/**
 * The only recorder-to-storage boundary: redact first, validate second, then
 * publish a protocol-owned RawEvent to the persistence sink.
 */
export function recordCapturedEvent(event: CapturedEvent, persist: RawEventSink): RawEvent {
  const safeEvent = parseRawEvent(redactRawEvent(event));
  persist(safeEvent);
  return safeEvent;
}
