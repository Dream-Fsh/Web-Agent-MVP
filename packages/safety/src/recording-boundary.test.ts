import { expect, it } from 'vitest';
import { redactRawEvent } from './index.js';
it('redacts credential patterns in plain input values and DOM text before storage', () => {
  const safe = redactRawEvent({ schemaVersion: '1.0', id: 'e', sessionId: 's', timestamp: 1, type: 'input', url: 'https://fixture.test/', frame: { frameId: 0, framePath: [] }, value: 'token=INPUT_SECRET', element: { tag: 'textarea', text: 'password=DOM_SECRET', attributes: {}, nearbyText: ['cookie=NEARBY_SECRET'], locatorCandidates: [] } });
  expect(JSON.stringify(safe)).not.toMatch(/INPUT_SECRET|DOM_SECRET|NEARBY_SECRET/);
});
