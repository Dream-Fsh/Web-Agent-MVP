import { parseRawEvent, parseRecordingAnnotation, validateAnnotationReferences, type RawEvent, type RawEventType } from "@web-agent/protocol";
import { redactRawEvent, redactSensitiveData } from "@web-agent/safety";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Source-shaped data is confined to this adapter and never exported downstream. */
export interface SourceRecordingSession {
  id: string;
  actions: Array<{ id: string; timestamp: number; type: RawEventType; url: string; frame?: RawEvent["frame"]; value?: string; attributes?: Record<string, string> }>;
}

export interface RawRecordingInput { sessionId: string; events: unknown[]; annotations: unknown[] }
/** Validates the entire batch before writing a new immutable recording directory. */
export async function persistRawRecording(input: RawRecordingInput, root: string): Promise<PersistedRecordingLocation & { annotationsPath: string }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.sessionId)) throw new Error('Unsafe session path');
  const events = input.events.map(value => parseRawEvent(redactRawEvent(value as RawEvent)));
  if (events.some(event => event.sessionId !== input.sessionId)) throw new Error('Event session does not match');
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate event id');
  const annotations = input.annotations.map(value => {
    const safe = redactSensitiveData(value) as { metadata?: Record<string, unknown> };
    if (safe.metadata?.sensitive === true) safe.metadata.originalValue = '[REDACTED]';
    return parseRecordingAnnotation(safe);
  });
  validateAnnotationReferences(annotations, events, input.sessionId);
  // Redact a declared secret at the raw boundary too, without adding variable semantics to RawEvent.
  for (const annotation of annotations) if (annotation.type === 'variable' && annotation.metadata.sensitive) {
    for (const event of events) if (event.id === annotation.targetActionId) event.value = '[REDACTED]';
  }
  await mkdir(root, { recursive: true });
  const directory = join(root, input.sessionId);
  // Reserve the final name, rejecting duplicate sessions and concurrent writers.
  await mkdir(directory);
  await mkdir(join(directory, 'screenshots'));
  await writeFile(join(directory, 'raw-events.ndjson'), events.map(event => JSON.stringify(event)).join('\n') + '\n');
  await writeFile(join(directory, 'annotations.json'), JSON.stringify(annotations, null, 2) + '\n');
  // Metadata is the completion marker, written only after both data files succeed.
  await writeFile(join(directory, 'metadata.json'), JSON.stringify({ schemaVersion: '1.0', sessionId: input.sessionId, eventCount: events.length, createdAt: new Date().toISOString() }) + '\n');
  return { metadataPath: join(directory, 'metadata.json'), rawEventsPath: join(directory, 'raw-events.ndjson'), screenshotsPath: join(directory, 'screenshots'), annotationsPath: join(directory, 'annotations.json') };
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
