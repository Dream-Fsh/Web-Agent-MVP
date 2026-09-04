import { expect, test } from "@playwright/test";
import { chromium, type Browser } from "@playwright/test";
import type { Workflow } from "@web-agent/protocol";
import { runWorkflow } from "@web-agent/runner";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";

let fixture: FixtureServer;
let browser: Browser;

test.beforeAll(async () => {
  fixture = await startFixtureServer();
  browser = await chromium.launch({ channel:"chrome", headless:true });
});
test.afterAll(async () => { await browser.close(); await fixture.close(); });

function workflow(startUrl: string, steps: Workflow["steps"]): Workflow {
  return {
    schemaVersion:"1.0", id:"integration-hardening", version:1, name:"integration hardening", startUrl, variables:{}, steps,
    metadata:{ createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" },
  };
}

test("switchTab updates the active page before variable-resolved input and click", async () => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageB.goto(`${fixture.baseUrl}/rta`);
  const result = await runWorkflow(pageA, workflow(`${fixture.baseUrl}/modal`, [
    { id:"switch", type:"switchTab", parameters:{ index:1 } },
    { id:"account", type:"input", parameters:{ value:"{{accountId}}" }, target:{ fingerprint:{ tag:"input" }, locators:[{ strategy:"label", value:"账户ID", score:1 }] } },
    { id:"query", type:"click", target:{ fingerprint:{ role:"button" }, locators:[{ strategy:"role", value:"查询", score:1 }] } },
  ]), { variables:{ accountId:"10001" } });
  expect(result.status).toBe("success");
  await expect(pageB.getByLabel("账户ID")).toHaveValue("10001");
  await expect(pageA.getByLabel("账户ID")).toHaveCount(0);
  await context.close();
});

test("assertions and extraction are reflected in the RunResult", async () => {
  const page = await browser.newPage();
  const result = await runWorkflow(page, workflow(`${fixture.baseUrl}/rta`, [
    { id:"url", type:"assert", parameters:{ assertions:[{ id:"rta", type:"assertUrl", expected:"/rta", required:true }] } },
    { id:"count", type:"extract", parameters:{ operation:"extractCount", key:"tables" }, target:{ fingerprint:{ tag:"table" }, locators:[{ strategy:"css", value:"table", score:1 }] } },
  ]));
  expect(result).toMatchObject({ status:"success", outputs:{ tables:1 } });
  await page.close();
});
