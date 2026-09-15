import { test, expect, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFixtureServer } from '@web-agent/fixture-site';
import { startRecordingService } from '@web-agent/recording-service';
import { saveWorkflow } from '@web-agent/workflow-builder/persistence';

const binary = resolve('apps/cli/dist/bin.js');
const modelDouble = resolve('tests/helpers/planner-double.mjs');
function cli(root: string, args: string[], fixture?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [binary, 'agent', ...args, '--root', root], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WEB_AGENT_PLANNER_TEST_MODE: '1', ...(fixture ? { WEB_AGENT_PLANNER_TEST_COMMAND: JSON.stringify([process.execPath, modelDouble, JSON.stringify(fixture)]) } : {}) } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
test('Agent CLI uses Extension-generated workflow, validates two skills, confirms and replays real outputs', async ({}, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'agent-browser-'));
  const fixture = await startFixtureServer();
  const service = await startRecordingService({ root });
  const extension = resolve('apps/extension/dist');
  const context = await chromium.launchPersistentContext(join(root, 'record-profile'), { channel: 'chromium', headless: true,
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
  try {
    const page = await context.newPage(); await page.goto(fixture.baseUrl + '/rta');
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage(); await popup.goto('chrome-extension://' + new URL(worker.url()).host + '/popup.html');
    await popup.getByLabel('目标页面', { exact: true }).selectOption({ label: fixture.baseUrl + '/rta' });
    await popup.getByLabel('本地服务地址', { exact: true }).fill(service.baseUrl);
    await popup.getByLabel('配对码', { exact: true }).fill(service.capability);
    await popup.getByRole('button', { name: '连接保存服务', exact: true }).click();
    await expect(popup.getByRole('status')).toHaveText('保存服务：已连接'); await popup.close();
    const ui = page.locator('web-agent-recorder');
    await ui.locator('summary').click(); await ui.locator('#generate-workflow').check();
    await ui.getByRole('button', { name: '开始录制', exact: true }).click();
    await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    await page.getByLabel('账户ID', { exact: true }).fill('10001');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(page.locator('#query-result')).toContainText('10001');
    await ui.getByRole('button', { name: '标记变量', exact: true }).click();
    await page.getByLabel('账户ID', { exact: true }).click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 1');
    await ui.getByRole('button', { name: '标记提取', exact: true }).click();
    await page.locator('table').click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 2');
    await ui.getByLabel('断言类型', { exact: true }).selectOption('assertText');
    await ui.getByLabel('预期值', { exact: true }).fill('{{accountId}}');
    await ui.getByRole('button', { name: '标记断言', exact: true }).click();
    await page.locator('#query-result').click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 3');
    await ui.getByRole('button', { name: '停止录制', exact: true }).click();
    await expect(ui.getByTestId('saved')).toContainText('已保存：');
    await page.screenshot({ path: info.outputPath('agent-recorded-fixture.png') });
    const [workflowId] = await readdir(join(root, 'workflows'));
    await context.close();
    const titleTarget = { fingerprint: {}, locators: [{ strategy: 'css' as const, value: 'h1', score: 1 }] };
    await saveWorkflow({ schemaVersion: '1.0', id: 'dashboard', version: 1, name: 'Dashboard title', startUrl: fixture.baseUrl + '/dashboard', variables: {},
      steps: [{ id: 'title', type: 'extract', target: titleTarget, parameters: { key: 'title', operation: 'extractText' } },
        { id: 'check', type: 'assert', parameters: { assertions: [{ id: 'title-visible', type: 'assertVisible', target: titleTarget, required: true }] } }],
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, join(root, 'workflows'));
    for (const [id, purpose, workflow] of [['query', 'account_table', workflowId], ['dashboard', 'dashboard_title', 'dashboard']]) {
      const path = join(root, id + '.json');
      await writeFile(path, JSON.stringify({ id, purpose, workflowId: workflow, version: 1, name: id, description: id === 'query' ? '查询账户并提取表格' : '读取后台标题' }));
      const registration = await cli(root, ['skills', 'register', path, '--confirm', '--headless', ...(id === 'query' ? ['--var', 'accountId=10001'] : [])]);
      expect(registration.code, registration.stdout + registration.stderr).toBe(0);
      expect(JSON.parse(registration.stdout).enabled).toBe(false);
      expect((await cli(root, ['skills', 'enable', id, '--confirm'])).code).toBe(0);
    }
    const skills = JSON.parse((await cli(root, ['skills'])).stdout);
    expect(skills).toHaveLength(2);
    const runCount = (await readdir(join(root, 'data/runs'))).length;
    const goal = '请把账户 20002 的数据查出来，提取结果表格';
    const model = { task: goal, decision: { status: 'ready', skillId: 'query', version: 1, purpose: 'account_table', parameters: [{ name: 'accountId', value: '20002' }], candidates: ['query'], missingFields: [] } };
    const planning = await cli(root, ['plan', goal], model);
    expect(planning.code, planning.stdout + planning.stderr).toBe(0);
    const { plan } = JSON.parse(planning.stdout);
    expect(plan.variables).toEqual({ accountId: '20002' }); expect(plan.modelKind).toBe('test-double');
    expect((await readdir(join(root, 'data/runs'))).length).toBe(runCount);
    const unconfirmed = await cli(root, ['execute', plan.id, '--headless']);
    expect(unconfirmed.code).toBe(2);
    expect((await readdir(join(root, 'data/runs'))).length).toBe(runCount);
    const execution = await cli(root, ['execute', plan.id, '--confirm', '--headless']);
    expect(execution.code, execution.stdout + execution.stderr).toBe(0);
    const result = JSON.parse(execution.stdout);
    expect(result.status).toBe('success'); expect(result.result.status).toBe('success');
    expect(result.result.outputs.results.rows).toEqual(expect.arrayContaining([expect.arrayContaining(['账户 20002 策略 001'])]));
    expect(Object.values(result.result.outputs).some((output: any) => output?.results?.some((item: any) => item.required && item.status === 'passed'))).toBe(true);
    expect((await cli(root, ['execute', plan.id, '--confirm', '--headless'])).code).toBe(2);
    expect((await readdir(join(root, 'data/runs'))).length).toBe(runCount + 1);
    // Persist only synthetic evidence, never the browser profile, key, or raw recordings.
    await writeFile(info.outputPath('agent-result.json'), execution.stdout);
    await writeFile(info.outputPath('agent-plan.json'), planning.stdout);
    await writeFile(info.outputPath('agent-skill-validation.json'), JSON.stringify(skills));
  } finally { await context.close(); await service.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});
