import { parseRawEvent, type RawEvent, type RawEventType } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";

/** Source-shaped data is confined to this adapter and never exported downstream. */
export interface SourceRecordingSession {
  id: string;
  actions: Array<{ id: string; timestamp: number; type: RawEventType; url: string; frame?: RawEvent["frame"]; value?: string; attributes?: Record<string, string> }>;
}

export function adaptRecording(session: SourceRecordingSession): RawEvent[] {
  return session.actions.map((action) => {
    if (!action.frame) throw new Error("Source action lacks stable frame identity");
    const event: RawEvent = { schemaVersion:"1.0", id:action.id, sessionId:session.id, timestamp:action.timestamp, type:action.type, url:action.url, frame:action.frame, value:action.value,
      element: action.attributes ? { tag:"unknown", attributes:action.attributes, nearbyText:[], locatorCandidates:[] } : undefined };
    return parseRawEvent(redactRawEvent(event));
  });
}
