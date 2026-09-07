import type { RawEvent, Target } from '@web-agent/protocol';
import { redactSensitiveData } from '@web-agent/safety';
import { recordCapturedEvent } from './index.js';

// UI marks remain separate from RawEvent; Task 09B supplies the formal protocol.
export interface RecorderMark {
  id: string; sessionId: string;
  type: 'variable' | 'extraction' | 'requiredAssertion';
  targetActionId?: string; target: Target; metadata: Record<string, unknown>;
}
export interface RecorderState {
  sessionId: string; recording: boolean; events: RawEvent[]; annotations: RecorderMark[];
}
export function emptyRecorderState(): RecorderState {
  return { sessionId: '', recording: false, events: [], annotations: [] };
}
export function updateRecorder(state: RecorderState, command: { kind: string; event?: RawEvent; annotation?: RecorderMark }): RecorderState {
  if (command.kind === 'start') {
    if (state.recording) throw new Error('Already recording');
    return { ...emptyRecorderState(), sessionId: crypto.randomUUID(), recording: true };
  }
  if (command.kind === 'stop') return { ...state, recording: false };
  if (command.kind === 'raw-event') {
    if (!state.recording || command.event?.sessionId !== state.sessionId) return state;
    const event = recordCapturedEvent(command.event, () => {});
    return { ...state, events: [...state.events, event] };
  }
  if (command.kind === 'annotation') {
    if (!state.recording || command.annotation?.sessionId !== state.sessionId) throw new Error('No matching active session');
    const mark = redactSensitiveData(command.annotation);
    if (mark.metadata.sensitive) mark.metadata.originalValue = '[REDACTED]';
    return { ...state, annotations: [...state.annotations, mark] };
  }
  return state;
}
