import { parseRecordingAnnotation, validateAnnotationReferences, type RawEvent, type RecordingAnnotation } from '@web-agent/protocol';
import { redactSensitiveData } from '@web-agent/safety';
import { recordCapturedEvent } from './index.js';

export type RecorderMark = RecordingAnnotation;
export interface RecorderState {
  sessionId: string; recording: boolean; events: RawEvent[]; annotations: RecorderMark[];
}
export function emptyRecorderState(): RecorderState {
  return { sessionId: '', recording: false, events: [], annotations: [] };
}
export function updateRecorder(state: RecorderState, command: { kind: string; event?: RawEvent; annotation?: RecorderMark; url?: string }): RecorderState {
  if (command.kind === 'start') {
    if (state.recording) throw new Error('Already recording');
    const next = { ...emptyRecorderState(), sessionId: crypto.randomUUID(), recording: true };
    if (command.url) next.events.push(recordCapturedEvent({ schemaVersion: '1.0', id: crypto.randomUUID(), sessionId: next.sessionId, timestamp: Date.now(), type: 'navigation', url: command.url, frame: { frameId: 0, framePath: [] } }, () => {}));
    return next;
  }
  if (command.kind === 'stop') return { ...state, recording: false };
  if (command.kind === 'raw-event') {
    if (!state.recording || command.event?.sessionId !== state.sessionId) return state;
    const event = recordCapturedEvent(command.event, () => {});
    const declaredSecret = state.annotations.some(annotation => {
      if (annotation.type !== 'variable' || !annotation.metadata.sensitive) return false;
      const original = state.events.find(previous => previous.id === annotation.targetActionId);
      return original?.element && JSON.stringify([original.frame, original.element]) === JSON.stringify([event.frame, event.element]);
    });
    if (declaredSecret) event.value = '[REDACTED]';
    return { ...state, events: [...state.events, event] };
  }
  if (command.kind === 'annotation') {
    if (!state.recording || command.annotation?.sessionId !== state.sessionId) throw new Error('No matching active session');
    const mark = redactSensitiveData(command.annotation);
    if (mark.metadata.sensitive) mark.metadata.originalValue = '[REDACTED]';
    const annotations = [...state.annotations, parseRecordingAnnotation(mark)];
    validateAnnotationReferences(annotations, state.events, state.sessionId);
    const referenced = state.events.find(event => event.id === mark.targetActionId);
    const events = mark.type === 'variable' && mark.metadata.sensitive
      ? state.events.map(event => event.id === mark.targetActionId || (referenced?.element && JSON.stringify(event.element) === JSON.stringify(referenced.element)) ? { ...event, value: '[REDACTED]' } : event)
      : state.events;
    return { ...state, events, annotations };
  }
  return state;
}
