import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFixtureServer } from '@web-agent/fixture-site';

test('recorder waits for initial background state before accepting start', async () => {
  const fixture = await startFixtureServer();
  const profile = await mkdtemp(join(tmpdir(), 'recorder-init-'));
  const extension = resolve('apps/extension/dist');
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await worker.evaluate(() => {
      const world = globalThis as any;
      const original = world.chrome.storage.session.get.bind(world.chrome.storage.session);
      world.chrome.storage.session.get = async (key: unknown) => {
        if (typeof key === 'string' && key.startsWith('recording-')) {
          world.chrome.storage.session.get = original;
          await new Promise(resolve => { world.releaseInitialStatus = resolve; });
        }
        return original(key);
      };
    });
    const page = await context.newPage(); await page.goto(fixture.baseUrl + '/rta');
    const start = page.locator('web-agent-recorder').getByRole('button', { name: '开始录制', exact: true });
    await expect.poll(() => worker.evaluate(() => typeof (globalThis as any).releaseInitialStatus)).toBe('function');
    await expect(start).toBeDisabled();
    await worker.evaluate(() => (globalThis as any).releaseInitialStatus());
    await expect(start).toBeEnabled(); await start.click();
    await expect(page.locator('web-agent-recorder').getByTestId('recording')).toHaveText('Recording: ON');
  } finally { await context.close(); await fixture.close(); await rm(profile, { recursive: true, force: true }); }
});
