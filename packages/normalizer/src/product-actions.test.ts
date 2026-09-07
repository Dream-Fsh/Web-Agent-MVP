import { expect, it } from 'vitest';
import { normalizeEvents } from './index.js';
import { parseRawEvent } from '@web-agent/protocol';
it('normalizes select changes and download links as their replay operations', () => {
  const event = { schemaVersion: '1.0', id: 's', sessionId: 's', timestamp: 1, type: 'change', url: 'https://fixture.test/', frame: { frameId: 0, framePath: [] }, value: 'active', element: { tag: 'select', attributes: { name: 'status' }, nearbyText: [], locatorCandidates: [] } };
  expect(normalizeEvents([parseRawEvent(event)])[0].type).toBe('select');
  expect(normalizeEvents([parseRawEvent({ ...event, type: 'click', element: { ...event.element, tag: 'a', attributes: { id: 'report', download: '' } } })])[0].type).toBe('download');
});
