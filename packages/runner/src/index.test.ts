import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import type { Workflow } from "@web-agent/protocol";
import { UnsafeActionBlockedError } from "@web-agent/safety";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";
import { runWorkflow } from "./index.js";

let fixture: FixtureServer;
let browser: Browser;
beforeAll(async () => { fixture = await startFixtureServer(); browser = await chromium.launch({ channel:"chrome", headless:true }); });
afterAll(async () => { await browser.close(); await fixture.close(); });

const workflow = (startUrl: string, steps: Workflow["steps"]): Workflow => ({
  schemaVersion:"1.0", id:"workflow", version:1, name:"fixture workflow", startUrl, variables:{}, steps,
  metadata:{ createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" },
});

it("runs workflow executors through safety and locator resolution without fixed sleeps", async () => {
  const page = await browser.newPage();
  const result = await runWorkflow(page, workflow(`${fixture.baseUrl}/modal`, [
    { id:"open", type:"click", target:{ fingerprint:{ role:"button" }, locators:[{ strategy:"role", value:"打开筛选弹窗", score:1 }] } },
    { id:"ready", type:"waitFor", target:{ fingerprint:{ tag:"dialog" }, locators:[{ strategy:"css", value:"dialog[open]", score:1 }] } },
  ]));
  expect(result.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
  expect(await page.locator("dialog[open]").count()).toBe(1);
  await page.close();
});

it("blocks write and destructive workflow steps before Playwright acts", async () => {
  const page = await browser.newPage();
  await expect(runWorkflow(page, workflow(`${fixture.baseUrl}/write-actions`, [
    { id:"delete", type:"click", target:{ fingerprint:{ text:"删除广告" }, locators:[{ strategy:"text", value:"删除广告", score:1 }] } },
  ]))).rejects.toBeInstanceOf(UnsafeActionBlockedError);
  await page.close();
});

it("updates the execution context after switchTab so later input and click use Page B", async () => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageB.goto(`${fixture.baseUrl}/rta`);
  await runWorkflow(pageA, workflow(`${fixture.baseUrl}/modal`, [
    { id:"switch", type:"switchTab", parameters:{ index:1 } },
    { id:"account", type:"input", parameters:{ value:"10001" }, target:{ fingerprint:{ tag:"input" }, locators:[{ strategy:"label", value:"账户ID", score:1 }] } },
    { id:"query", type:"click", target:{ fingerprint:{ role:"button" }, locators:[{ strategy:"role", value:"查询", score:1 }] } },
  ]));
  expect(await pageB.getByLabel("账户ID").inputValue()).toBe("10001");
  expect(await pageA.getByLabel("账户ID").count()).toBe(0);
  await context.close();
});
