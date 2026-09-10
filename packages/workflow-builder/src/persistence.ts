import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflow } from '@web-agent/protocol';

async function writeSynced(path: string, content: unknown): Promise<void> {
  const file = await fs.open(path, 'wx');
  try { await file.writeFile(JSON.stringify(content, null, 2) + '\n', 'utf8'); await file.sync(); }
  finally { await file.close(); }
}

/** Publishes an immutable version before atomically replacing its current pointer. */
export async function saveWorkflow(input: unknown, root: string, options: { version?: number; expectedCurrentVersion?: number; signal?:AbortSignal } = {}): Promise<{ path: string; version: number }> {
  options.signal?.throwIfAborted();
  const workflow = parseWorkflow(input);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workflow.id)) throw new Error('Unsafe workflow id');
  const directory = join(root, workflow.id);
  await fs.mkdir(directory, { recursive: true });
  const lockPath = join(directory, '.writer.lock');
  const lock = await fs.open(lockPath, 'wx');
  const nonce = crypto.randomUUID();
  const stagedVersion = join(directory, `.version-${nonce}.tmp`);
  const stagedCurrent = join(directory, `.current-${nonce}.tmp`);
  let installedPath: string | undefined;
  let promoted = false;
  try {
    let current = 0;
    try {
      const pointer = JSON.parse(await fs.readFile(join(directory, 'current.json'), 'utf8')) as { currentVersion?: unknown };
      if (typeof pointer.currentVersion !== 'number' || !Number.isSafeInteger(pointer.currentVersion) || pointer.currentVersion < 1) throw new Error('Invalid current version');
      current = pointer.currentVersion;
      const previous = parseWorkflow(JSON.parse(await fs.readFile(join(directory, `v${current}.json`), 'utf8')));
      if (previous.id !== workflow.id || previous.version !== current) throw new Error('Current version does not match its workflow file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Only an absent pointer is a new workflow; a missing referenced version is corruption.
      if (current !== 0) throw new Error('Current version file is missing');
    }
    if (options.expectedCurrentVersion !== undefined && current !== options.expectedCurrentVersion) throw new Error('Stale workflow version');
    const history = await workflowHistory(root, workflow.id);
    const version = Math.max(current, ...history.map(item => item.version)) + 1;
    if (options.version !== undefined && options.version !== version) throw new Error('Version must increase by exactly one; duplicate version rejected');
    const path = join(directory, `v${version}.json`);
    const validated = parseWorkflow({ ...workflow, version });
    await writeSynced(stagedVersion, validated);
    // link is create-only: unlike rename it can never overwrite an existing version.
    await fs.link(stagedVersion, path);
    installedPath = path;
    await writeSynced(stagedCurrent, { currentVersion: version });
    options.signal?.throwIfAborted();
    await fs.rename(stagedCurrent, join(directory, 'current.json'));
    promoted = true;
    return { path, version };
  } catch (error) {
    if (installedPath && !promoted) await fs.unlink(installedPath);
    throw error;
  } finally {
    await fs.rm(stagedVersion, { force: true });
    await fs.rm(stagedCurrent, { force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}

function workflowDirectory(root: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error('Unsafe workflow id');
  return join(root, id);
}

export async function loadWorkflow(root: string, id: string, version?: number) {
  const directory = workflowDirectory(root, id);
  const selected = version ?? (JSON.parse(await fs.readFile(join(directory, 'current.json'), 'utf8')) as { currentVersion: unknown }).currentVersion;
  if (typeof selected !== 'number' || !Number.isSafeInteger(selected) || selected < 1) throw new Error('Invalid workflow version');
  const workflow = parseWorkflow(JSON.parse(await fs.readFile(join(directory, `v${selected}.json`), 'utf8')));
  if (workflow.id !== id || workflow.version !== selected) throw new Error('Workflow identity/version mismatch');
  return workflow;
}

export async function workflowHistory(root: string, id: string) {
  const files = await fs.readdir(workflowDirectory(root, id));
  const versions = files.flatMap(file => /^v([1-9]\d*)\.json$/.test(file) ? [Number(file.slice(1, -5))] : []).sort((a, b) => a - b);
  return Promise.all(versions.map(version => loadWorkflow(root, id, version)));
}

export async function listWorkflows(root: string) {
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return Promise.all(entries.filter(entry => entry.isDirectory()).sort((a,b) => a.name.localeCompare(b.name)).map(entry => loadWorkflow(root, entry.name)));
}

export async function rollbackStoredWorkflow(root: string, id: string, version: number): Promise<void> {
  const directory = workflowDirectory(root, id);
  const lockPath = join(directory, '.writer.lock');
  const lock = await fs.open(lockPath, 'wx');
  const staged = join(directory, `.current-${crypto.randomUUID()}.tmp`);
  try {
    await loadWorkflow(root, id, version);
    await writeSynced(staged, { currentVersion: version });
    await fs.rename(staged, join(directory, 'current.json'));
  } finally { await fs.rm(staged, { force: true }); await lock.close(); await fs.unlink(lockPath); }
}
