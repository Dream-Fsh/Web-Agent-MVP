import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import * as save from './saveResult.js';
it('treats a dropped response as an unconfirmed outcome, not a confirmed failed save', async () => {
  expect(save).toHaveProperty('sendRecording');
  const server = createServer(request => { request.resume(); request.on('end', () => request.socket.destroy()); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');
    const result = await save.sendRecording(`http://127.0.0.1:${address.port}`, 'test-pairing', { sessionId: 's', events: [], annotations: [] });
    expect(result.saveError).toContain('待确认');
    expect(result.savedPath).toBeUndefined();
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
