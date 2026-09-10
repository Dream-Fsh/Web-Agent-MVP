import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkflow } from '@web-agent/workflow-builder';
import { saveWorkflow } from '@web-agent/workflow-builder/persistence';
import { runCli } from './index.js';

it('inspects the actual current Workflow and lists version/date, never just the pointer', async () => {
  const root = await mkdtemp(join(tmpdir(),'cli-production-'));
  const workflowsRoot = join(root,'workflows');
  try {
    const workflow = buildWorkflow([],[],{id:'query',name:'Query',sessionId:'s',startUrl:'http://127.0.0.1/rta',createdAt:'2026-09-08T00:00:00.000Z'});
    await saveWorkflow(workflow,workflowsRoot);
    const list = await runCli(['workflow','list'],{workflowsRoot});
    expect(list).toContain('query'); expect(list).toContain('v1'); expect(list).toContain('2026-09-08');
    expect(JSON.parse(await runCli(['workflow','inspect','query'],{workflowsRoot}))).toMatchObject({id:'query',version:1,steps:[],variables:{},metadata:workflow.metadata});
    await expect(runCli(['workflow','inspect','../escape'],{workflowsRoot})).rejects.toThrow();
    expect(JSON.parse(await readFile(join(workflowsRoot,'query/current.json'),'utf8'))).toEqual({currentVersion:1});
    await expect(runCli(['run','query','--unknown'],{workflowsRoot})).rejects.toThrow(/unknown/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});
