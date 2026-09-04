import { parseRawEvent, type RawEvent, type RawEventType } from "@web-agent/protocol";
import { redactRawEvent } from "@web-agent/safety";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Source-shaped data is confined to this adapter and never exported downstream. */
export interface SourceRecordingSession {
  id: string;
  actions: Array<{ id: string; timestamp: number; type: RawEventType; url: string; frame?: RawEvent["frame"]; value?: string; attributes?: Record<string, string> }>;
}

export interface PersistedRecordingLocation {
  metadataPath: string;
  rawEventsPath: string;
  screenshotsPath: string;
}

export function adaptRecording(session: SourceRecordingSession): RawEvent[] {
  return session.actions.map((action) => {
    if (!action.frame) throw new Error("Source action lacks stable frame identity");
    const event: RawEvent = { schemaVersion:"1.0", id:action.id, sessionId:session.id, timestamp:action.timestamp, type:action.type, url:action.url, frame:action.frame, value:action.value,
      element: action.attributes ? { tag:"unknown", attributes:action.attributes, nearbyText:[], locatorCandidates:[] } : undefined };
    return parseRawEvent(redactRawEvent(event));
  });
}

/**
 * Persists the protocol-owned representation only. Source recording shapes
 * deliberately terminate at adaptRecording and cannot flow into this layout.
 */
export async function persistRecording(session: SourceRecordingSession, recordingsRoot: string): Promise<PersistedRecordingLocation> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(session.id)) {
    throw new Error("Recording session id must be a safe path segment");
  }

  const events = adaptRecording(session);
  const recordingPath = join(recordingsRoot, session.id);
  const screenshotsPath = join(recordingPath, "screenshots");
  const metadataPath = join(recordingPath, "metadata.json");
  const rawEventsPath = join(recordingPath, "raw-events.ndjson");
  await mkdir(screenshotsPath, { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify({ schemaVersion:"1.0", sessionId:session.id, eventCount:events.length, createdAt:new Date().toISOString() })}\n`, "utf8");
  await writeFile(rawEventsPath, events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : ""), "utf8");
  return { metadataPath, rawEventsPath, screenshotsPath };
}
