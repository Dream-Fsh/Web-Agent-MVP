import { expect, it } from 'vitest';
import * as protocol from './index.js';

const target = { fingerprint: { tag: 'input' }, locators: [{ strategy: 'css', value: 'input', score: 1 }] };
const base = { id: 'a', sessionId: 's', targetActionId: 'e', target };
it('validates each annotation kind independently from RawEvent', () => {
  expect(protocol).toHaveProperty('parseRecordingAnnotation');
  for (const annotation of [
    { ...base, type: 'variable', metadata: { originalValue: '10001', variableName: 'accountId', sensitive: false } },
    { ...base, type: 'extraction', metadata: { operation: 'extractTable', key: 'results' } },
    { ...base, type: 'requiredAssertion', metadata: { assertionType: 'assertVisible', expected: '', required: true } },
  ]) expect(protocol.parseRecordingAnnotation(annotation)).toEqual(annotation);
});
it('rejects malformed metadata, missing target, and non-required assertions', () => {
  expect(protocol).toHaveProperty('parseRecordingAnnotation');
  for (const annotation of [
    { ...base, type: 'variable', metadata: { variableName: 'bad name', sensitive: false } },
    { ...base, type: 'extraction', target: undefined, metadata: { operation: 'extractTable', key: 'r' } },
    { ...base, type: 'requiredAssertion', metadata: { assertionType: 'unknown', expected: '', required: false } },
  ]) expect(() => protocol.parseRecordingAnnotation(annotation)).toThrow();
});
