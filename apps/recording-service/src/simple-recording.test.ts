import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRecordingService } from './index.js';

it('saves unannotated ordinary clicks and scrolls, and preserves records when conversion fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simple-recording-'));
  const bridge = await startRecordingService({ root });
  try {
    for (const convert of [false, true]) {
      const sessionId = convert ? 'conversion-failure' : 'plain';
      const base = { schemaVersion: '1.0', sessionId, timestamp: 1, url: 'http://127.0.0.1:1234/rta', frame: { frameId: 0, framePath: [] } };
      const events = [
        { ...base, id: 'nav', type: 'navigation' },
        { ...base, id: 'cell', type: 'click', element: { tag: 'td', text: 'RTA002', attributes: {}, nearbyText: [], locatorCandidates: [] } },
        { ...base, id: 'scroll', type: 'scroll', metadata: { x: 0, y: 500 } },
        { ...base, id: 'secret', type: 'input', value: 'TEST_SECRET', element: { tag: 'input', attributes: { type: 'password' }, nearbyText: [], locatorCandidates: [] } },
      ];
      const response = await fetch(bridge.baseUrl + '/recordings', { method: 'POST', headers: { Authorization: `Bearer ${bridge.capability}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, events, annotations: [], generateWorkflow: convert }) });
      expect(response.status).toBe(201);
      const saved = await response.json() as { recordingPath: string; workflowWarning?: string };
      expect(Boolean(saved.workflowWarning)).toBe(convert);
      const text = await readFile(join(saved.recordingPath, 'raw-events.ndjson'), 'utf8');
      expect(text).not.toContain('TEST_SECRET');
      expect(text).toContain('[REDACTED]');
      expect(text.trim().split('\n')).toHaveLength(4);
      expect(JSON.parse(await readFile(join(saved.recordingPath, 'annotations.json'), 'utf8'))).toEqual([]);
    }
    expect(await readdir(root)).not.toContain('workflows');
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
