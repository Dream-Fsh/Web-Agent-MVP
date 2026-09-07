import { expect, it } from 'vitest';
import * as adapter from './index.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('persists annotations separately and never writes a secret variable value', async () => {
  expect(adapter).toHaveProperty('persistRawRecording');
  const root = await mkdtemp(join(tmpdir(), 'annotation-test-'));
  try {
    const event = { schemaVersion: '1.0', id: 'e', sessionId: 's', timestamp: 1, type: 'input', url: 'https://test.local/?token=URL_SECRET', frame: { frameId: 0, framePath: [] }, value: '[REDACTED]' };
    const annotation = { id: 'a', sessionId: 's', targetActionId: 'e', type: 'variable', target: { fingerprint: { tag: 'input' }, locators: [{ strategy: 'css', value: 'input', score: 1 }] }, metadata: { originalValue: 'SECRET_VALUE', variableName: 'credential', sensitive: true } };
    await adapter.persistRawRecording({ sessionId: 's', events: [event], annotations: [annotation] }, root);
    const raw = await readFile(join(root, 's/raw-events.ndjson'), 'utf8');
    const marks = await readFile(join(root, 's/annotations.json'), 'utf8');
    expect(raw + marks).not.toMatch(/SECRET_VALUE|URL_SECRET/);
    expect(JSON.parse(marks)).toMatchObject([{ metadata: { sensitive: true, originalValue: '[REDACTED]' } }]);
    expect(raw).not.toContain('variableName');
    await expect(adapter.persistRawRecording({ sessionId: 's', events: [event], annotations: [annotation] }, root)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
