import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, lstat, realpath, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { acquirePersistenceLease } from '@web-agent/workflow-builder/persistence';

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function identifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}
export const agentRoot = (root: string) => join(resolve(root), 'data/agent');
export async function locked<T>(root: string, action: () => Promise<T>): Promise<T> {
  const lease = await acquirePersistenceLease(join(agentRoot(root), '.lock'));
  try { await lease.assertOwned(); return await action(); } finally { await lease.close(); }
}
export async function readJson(path: string, limit = 1048576): Promise<unknown> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Invalid or oversized local file');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function key(root: string): Promise<Buffer> {
  const path = join(agentRoot(root), '.key');
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(randomBytes(32)); await file.sync(); } finally { await file.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) throw new Error('Invalid local integrity key');
  return readFile(path);
}
async function location(root: string, kind: string, id: string) {
  const directory = join(agentRoot(root), identifier(kind));
  await mkdir(directory, { recursive: true });
  const base = await realpath(agentRoot(root));
  if (!(await realpath(directory)).startsWith(base + sep)) throw new Error('Unsafe agent directory');
  return join(directory, identifier(id) + '.json');
}
export async function publish(root: string, kind: string, id: string, payload: unknown) {
  const path = await location(root, kind, id);
  const mac = createHmac('sha256', await key(root)).update(JSON.stringify(payload)).digest('hex');
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify({ payload, mac }) + '\n'); await file.sync(); }
  finally { await file.close(); }
}
export async function readSealed<T>(root: string, kind: string, id: string): Promise<T> {
  const envelope = await readJson(await location(root, kind, id)) as { payload: T; mac: string };
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'mac,payload' || !/^[a-f0-9]{64}$/.test(envelope.mac)) throw new Error('Invalid signed artifact');
  const actual = createHmac('sha256', await key(root)).update(JSON.stringify(envelope.payload)).digest();
  if (!timingSafeEqual(actual, Buffer.from(envelope.mac, 'hex'))) throw new Error('Artifact changed; re-plan and confirm');
  return envelope.payload;
}
export async function exists(root: string, kind: string, id: string) {
  try { await lstat(await location(root, kind, id)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function ids(root: string, kind: string) {
  await mkdir(join(agentRoot(root), kind), { recursive: true });
  return (await readdir(join(agentRoot(root), kind))).filter(name => name.endsWith('.json')).map(name => identifier(name.slice(0, -5))).sort();
}
