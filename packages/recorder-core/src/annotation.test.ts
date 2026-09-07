import { expect, it } from 'vitest';
import { emptyRecorderState, updateRecorder, type RecorderMark } from './index.js';
const mark = (sessionId: string): RecorderMark => ({ id: 'a', sessionId, type: 'variable', targetActionId: 'missing', target: { fingerprint: { tag: 'input' }, locators: [{ strategy: 'css', value: 'input', score: 1 }] }, metadata: { originalValue: 'SECRET', variableName: 'credential', sensitive: true } });
it('rejects annotations referring to a missing recorded action', () => {
  const state = updateRecorder(emptyRecorderState(), { kind: 'start' });
  expect(() => updateRecorder(state, { kind: 'annotation', annotation: mark(state.sessionId) })).toThrow(/action/i);
});
it('redacts the referenced value when a field is declared sensitive', () => {
  let state = updateRecorder(emptyRecorderState(), { kind: 'start' });
  state = updateRecorder(state, { kind: 'raw-event', event: { schemaVersion: '1.0', id: 'e', sessionId: state.sessionId, timestamp: 1, type: 'input', url: 'https://test.local', frame: { frameId: 0, framePath: [] }, value: 'SECRET' } });
  state = updateRecorder(state, { kind: 'annotation', annotation: { ...mark(state.sessionId), targetActionId: 'e' } });
  expect(JSON.stringify(state)).not.toContain('SECRET');
});
it('keeps later edits of a declared secret redacted', () => {
  let state = updateRecorder(emptyRecorderState(), { kind: 'start' });
  const event = { schemaVersion: '1.0' as const, id: 'e', sessionId: state.sessionId, timestamp: 1, type: 'input' as const, url: 'https://test.local', frame: { frameId: 0, framePath: [] }, element: { tag: 'input', attributes: { name: 'custom' }, nearbyText: [], locatorCandidates: [] }, value: 'before' };
  state = updateRecorder(state, { kind: 'raw-event', event });
  state = updateRecorder(state, { kind: 'annotation', annotation: { ...mark(state.sessionId), targetActionId: 'e' } });
  state = updateRecorder(state, { kind: 'raw-event', event: { ...event, id: 'later', value: 'LATER_SECRET' } });
  expect(JSON.stringify(state)).not.toContain('LATER_SECRET');
});
