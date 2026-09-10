import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseRawEvent, parseRecordingAnnotation } from '@web-agent/protocol';
import { persistRawRecording } from '@web-agent/recording-adapter';
import { normalizeEvents } from '@web-agent/normalizer';
import { buildWorkflow } from '@web-agent/workflow-builder';
import { saveWorkflow,acquirePersistenceLease } from '@web-agent/workflow-builder/persistence';

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > 5 * 1024 * 1024) throw new Error('Recording exceeds size limit');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startRecordingService(options: { root: string; port?: number; leaseOptions?:{heartbeatMs?:number;timeoutMs?:number}; onSessionStarted?:(id:string)=>void; onWorkflowSaved?:(saved:{path:string;version:number})=>void }): Promise<{ baseUrl: string; capability: string; close: () => Promise<void> }> {
  const root = resolve(options.root);
  const lease=await acquirePersistenceLease(join(root,'data/recording.lock'),options.leaseOptions);
  const capability = randomBytes(24).toString('hex');
  let expectedHost = '';
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (request.headers.host !== expectedHost || (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))) { response.writeHead(403).end(); return; }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    if (request.headers.authorization !== `Bearer ${capability}`) { response.writeHead(401).end(); return; }
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }).end('{"ready":true}'); return; }
    if (request.method === 'POST' && request.url === '/sessions/start') {
      try {
        const input=await readBody(request) as {sessionId?:unknown};
        if(typeof input?.sessionId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.sessionId))throw new Error('Invalid session');
        await lease.heartbeat(input.sessionId);
        options.onSessionStarted?.(input.sessionId);
        response.writeHead(204).end();
      }catch{response.writeHead(400).end();}
      return;
    }
    if (request.method !== 'POST' || request.url !== '/recordings') { response.writeHead(404).end(); return; }
    try {
      const input = await readBody(request) as { sessionId?: unknown; events?: unknown; annotations?: unknown };
      if (!input || typeof input.sessionId !== 'string' || !Array.isArray(input.events) || !input.events.length || !Array.isArray(input.annotations)) throw new Error('Invalid recording envelope');
      await lease.assertOwned();
      const location = await persistRawRecording({ sessionId: input.sessionId, events: input.events, annotations: input.annotations }, join(root, 'data/recordings'));
      // Consume the validated, redacted persisted representation, never the incoming payload.
      const events = (await readFile(location.rawEventsPath, 'utf8')).trim().split('\n').map(line => parseRawEvent(JSON.parse(line)));
      const annotations = (JSON.parse(await readFile(location.annotationsPath, 'utf8')) as unknown[]).map(parseRecordingAnnotation);
      const actions = normalizeEvents(events);
      await writeFile(join(root, 'data/recordings', input.sessionId, 'normalized-actions.json'), JSON.stringify(actions, null, 2) + '\n');
      const workflow = buildWorkflow(actions, annotations, { id: input.sessionId, sessionId: input.sessionId, name: '录制查询', startUrl: events[0].url, createdAt: new Date().toISOString() });
      const saved = await saveWorkflow(workflow, join(root, 'workflows'));
      response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(saved));
      try { options.onWorkflowSaved?.(saved); } catch { /* An observer cannot undo committed persistence. */ }
    } catch {
      // Neither captured values nor request credentials belong in diagnostics.
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: '录制校验或 Workflow 保存失败；已保存的录制可供检查。' }));
    }
  });
  try{await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', resolve); });}catch(error){await lease.close();throw error;}
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Recording service did not bind');
  expectedHost = `127.0.0.1:${address.port}`;
  return { baseUrl: `http://${expectedHost}`, capability, close: async () => {await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });await lease.close();} };
}

export { startInteractiveRecording } from './interactive.js';

export {recoverRecordings} from './recovery.js';