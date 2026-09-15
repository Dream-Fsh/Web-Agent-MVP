import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestTaskPlan } from './planner.js';

const answer = { status: 'ready', skillId: 'query', version: 1, purpose: 'account_table', parameters: [{ name: 'accountId', value: '10001' }], candidates: ['query'], missingFields: [] };
it('invokes an isolated planning subprocess with bounded schema output, not repair', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planner-transport-'));
  try {
    const script = join(root, 'model-double.mjs');
    await writeFile(script, `let text='';for await(const c of process.stdin)text+=c;
      const args=process.argv.slice(2); if(!args.includes('--ignore-user-config')||!args.includes('--ephemeral')||!args.includes('shell_tool'))process.exit(3);
      if(text.includes('SYNTHETIC_SECRET')||text.includes('WorkflowRepairPatch'))process.exit(4);
      console.log(${JSON.stringify(JSON.stringify(answer))});`);
    expect(await requestTaskPlan({ task: '查询账户10001表格', skills: [], token: 'SYNTHETIC_SECRET' }, { command: [process.execPath, script] })).toEqual(answer);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('fails on timeout, malformed JSON, extra fields, excessive output, cancellation and unavailable model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planner-failures-'));
  try {
    const script = join(root, 'model-double.mjs');
    for (const code of [`console.log('not json')`, `console.log(${JSON.stringify(JSON.stringify({ ...answer, extra: 'SYNTHETIC_SECRET' }))})`, `console.log('x'.repeat(40000))`, `process.stderr.write('token=SYNTHETIC_SECRET');process.exit(3)`]) {
      await writeFile(script, code);
      await expect(requestTaskPlan({}, { command: [process.execPath, script] })).rejects.toThrow(/Planner/);
    }
    await writeFile(script, 'setInterval(()=>{},1000)');
    await expect(requestTaskPlan({}, { command: [process.execPath, script], timeoutMs: 100 })).rejects.toThrow(/timed out/i);
    const abort = new AbortController(); abort.abort();
    await expect(requestTaskPlan({}, { command: ['does-not-exist'], signal: abort.signal })).rejects.toThrow(/abort/i);
    await expect(requestTaskPlan({}, { command: ['does-not-exist'] })).rejects.toThrow(/Planner/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
