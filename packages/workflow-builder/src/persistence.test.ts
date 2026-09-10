import { expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as persistence from './persistence.js';
import { buildWorkflow } from './index.js';
import { normalizeEvents } from '@web-agent/normalizer';
import { parseRawEvent, parseWorkflow } from '@web-agent/protocol';
const generated = () => buildWorkflow(normalizeEvents([parseRawEvent({ schemaVersion: '1.0', id: 'n', sessionId: 's', timestamp: 1, type: 'navigation', url: 'https://fixture.test/rta', frame: { frameId: 0, framePath: [] } })]), [], { id: 'query', name: 'query', startUrl: 'https://fixture.test/rta', sessionId: 's', createdAt: '2026-09-07T00:00:00.000Z' });

it('saves generated v1 then v2 and keeps current pointing at the actual version', async () => {
  expect(persistence).toHaveProperty('saveWorkflow');
  const root = await fs.mkdtemp(join(tmpdir(), 'workflow-store-'));
  try {
    const first = await persistence.saveWorkflow(generated(), root);
    const second = await persistence.saveWorkflow(generated(), root);
    expect(first.version).toBe(1); expect(second.version).toBe(2);
    expect(parseWorkflow(JSON.parse(await fs.readFile(first.path, 'utf8'))).version).toBe(1);
    expect(parseWorkflow(JSON.parse(await fs.readFile(second.path, 'utf8'))).version).toBe(2);
    expect(JSON.parse(await fs.readFile(join(root, 'query/current.json'), 'utf8'))).toEqual({ currentVersion: 2 });
    await expect(persistence.saveWorkflow(generated(), root, { version: 1 })).rejects.toThrow(/version/i);
    await expect(persistence.saveWorkflow({ ...generated(), steps: [{ id: 'bad', type: 'click' }] }, root)).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(join(root, 'query/current.json'), 'utf8'))).toEqual({ currentVersion: 2 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('a failed atomic pointer promotion leaves the old current and version intact', async () => {
  expect(persistence).toHaveProperty('saveWorkflow');
  const root = await fs.mkdtemp(join(tmpdir(), 'workflow-interrupted-'));
  try {
    const first = await persistence.saveWorkflow(generated(), root);
    const before = await fs.readFile(first.path, 'utf8');
    const originalRename = fs.rename;
    const failure = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('current.json')) throw new Error('simulated interrupted write');
      return originalRename(from, to);
    });
    try { await expect(persistence.saveWorkflow(generated(), root)).rejects.toThrow('simulated interrupted write'); }
    finally { failure.mockRestore(); }
    expect(await fs.readFile(first.path, 'utf8')).toBe(before);
    expect(JSON.parse(await fs.readFile(join(root, 'query/current.json'), 'utf8'))).toEqual({ currentVersion: 1 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
it('rejects simultaneous writers without overwriting a version', async () => {
  expect(persistence).toHaveProperty('saveWorkflow');
  const root = await fs.mkdtemp(join(tmpdir(), 'workflow-concurrent-'));
  try {
    const outcomes = await Promise.allSettled([persistence.saveWorkflow(generated(), root), persistence.saveWorkflow(generated(), root)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(join(root, 'query/current.json'), 'utf8'))).toEqual({ currentVersion: 1 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

it('does not publish a cancelled version or change current',async()=>{
  const root=await fs.mkdtemp(join(tmpdir(),'workflow-cancel-'));
  try{
    await persistence.saveWorkflow(generated(),root);
    const controller=new AbortController();controller.abort();
    await expect(persistence.saveWorkflow(generated(),root,{signal:controller.signal})).rejects.toThrow(/abort/i);
    expect(JSON.parse(await fs.readFile(join(root,'query/current.json'),'utf8'))).toEqual({currentVersion:1});
    await expect(fs.readFile(join(root,'query/v2.json'))).rejects.toThrow();
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

it('holds a recoverable owner lease while publishing a workflow',async()=>{
  const root=await fs.mkdtemp(join(tmpdir(),'workflow-owner-'));
  const originalLink=fs.link;
  const link=vi.spyOn(fs,'link').mockImplementation(async(from,to)=>{
    const owner=JSON.parse(await fs.readFile(join(root,'query/.writer.lock/owner.json'),'utf8'));
    expect(owner.pid).toBe(process.pid);await originalLink(from,to);
  });
  try{await persistence.saveWorkflow(generated(),root);}finally{link.mockRestore();await fs.rm(root,{recursive:true,force:true});}
});
