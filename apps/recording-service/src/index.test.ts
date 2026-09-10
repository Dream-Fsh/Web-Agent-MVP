import { expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as service from './index.js';
it('rejects unpaired, foreign-origin, and malformed requests without creating files', async () => {
  expect(service).toHaveProperty('startRecordingService');
  const root = await mkdtemp(join(tmpdir(), 'recording-service-'));
  const bridge = await service.startRecordingService({ root });
  try {
    expect((await fetch(`${bridge.baseUrl}/recordings`, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(`${bridge.baseUrl}/recordings`, { method: 'POST', headers: { authorization: `Bearer ${bridge.capability}`, origin: 'https://untrusted.example' }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${bridge.baseUrl}/recordings`, { method: 'POST', headers: { authorization: `Bearer ${bridge.capability}` }, body: '{}' })).status).toBe(400);
    expect(await readdir(join(root,'data'))).toEqual(['recording.lock']);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
