import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkflow } from '@web-agent/workflow-builder';
import { saveWorkflow } from '@web-agent/workflow-builder/persistence';
import { normalizeEvents } from '@web-agent/normalizer';
import { parseRawEvent } from '@web-agent/protocol';
import { promoteRepairPatch, rollbackWorkflow } from './index.js';

it('promotes a recorded workflow through the same pointer store and preserves versions on rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repair-pointer-'));
  try {
    const workflow = buildWorkflow(normalizeEvents([parseRawEvent({ schemaVersion:'1.0', id:'input', sessionId:'s', type:'input', timestamp:1, url:'http://127.0.0.1/rta', frame:{frameId:0,framePath:[]}, element:{tag:'input',attributes:{name:'accountId'},nearbyText:[],locatorCandidates:[]}, value:'10001' })]), [], {id:'query',name:'Query',sessionId:'s',startUrl:'http://127.0.0.1/rta',createdAt:new Date().toISOString()});
    await saveWorkflow(workflow, root);
    const patch = { workflowId:'query',baseVersion:1,reason:'locator drift',confidence:0.9,operations:[{type:'addLocator',stepId:'step-1',locator:{strategy:'label',value:'账户ID',score:1}}] };
    await promoteRepairPatch(root, 'query', workflow, patch, async () => ({requiredAssertionsPassed:true}));
    expect(JSON.parse(await readFile(join(root,'query/current.json'),'utf8'))).toEqual({currentVersion:2});
    await rollbackWorkflow(root,'query',1);
    expect(JSON.parse(await readFile(join(root,'query/current.json'),'utf8'))).toEqual({currentVersion:1});
    expect(JSON.parse(await readFile(join(root,'query/v2.json'),'utf8'))).toMatchObject({version:2});
    await expect(promoteRepairPatch(root,'query',workflow,patch,async()=>({requiredAssertionsPassed:true}))).resolves.toMatchObject({version:3});
    await expect(promoteRepairPatch(root,'query',workflow,patch,async()=>({requiredAssertionsPassed:true}))).rejects.toThrow(/stale/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});
