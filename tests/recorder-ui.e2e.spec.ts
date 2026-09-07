import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFixtureServer } from '@web-agent/fixture-site';

test('extension visible UI records, annotates and stops with redacted storage', async () => {
  const fixture = await startFixtureServer();
  const profile = await mkdtemp(join(tmpdir(), 'recorder-ui-'));
  const extension = resolve('apps/extension/dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const page = await context.newPage();
    await page.goto(`${fixture.baseUrl}/login?token=URL_SECRET`);
    const ui = page.locator('web-agent-recorder');
    await expect(ui.getByRole('button', { name: '开始录制', exact: true })).toBeVisible();
    await ui.getByRole('button', { name: '开始录制', exact: true }).click();
    await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    await page.getByLabel('密码', { exact: true }).fill('PASSWORD_SECRET');
    await expect(ui.getByTestId('events')).not.toHaveText('Events: 0');
    await page.getByLabel('用户名', { exact: true }).fill('10001');
    await ui.getByLabel('变量名', { exact: true }).fill('accountId');
    await ui.getByRole('button', { name: '标记变量', exact: true }).click();
    await page.getByLabel('用户名', { exact: true }).click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 1');
    await ui.getByRole('button', { name: '标记提取', exact: true }).click();
    await page.getByRole('heading', { name: '登录', exact: true }).click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 2');
    await ui.getByRole('button', { name: '标记断言', exact: true }).click();
    await page.getByRole('heading', { name: '登录', exact: true }).click();
    await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 3');
    await page.screenshot({ path: 'test-results/recorder-ui.png' });
    await ui.getByRole('button', { name: '停止录制', exact: true }).click();
    await expect(ui.getByTestId('recording')).toHaveText('Recording: OFF');
    const count = await ui.getByTestId('events').textContent();
    await page.getByLabel('用户名', { exact: true }).fill('after-stop');
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const stored = await worker.evaluate(async () => (globalThis as any).chrome.storage.local.get(null));
    expect(JSON.stringify(stored)).not.toMatch(/PASSWORD_SECRET|URL_SECRET|after-stop/);
    expect(JSON.stringify(stored)).toContain('[REDACTED]');
    await expect(ui.getByTestId('events')).toHaveText(count!);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await expect(popup.getByText('Web Agent Recorder', { exact: true })).toBeVisible();
  } finally { await context.close(); await fixture.close(); await rm(profile, { recursive: true, force: true }); }
});
