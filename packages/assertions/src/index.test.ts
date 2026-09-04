import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";
import { evaluateAssertions } from "./index.js";

let fixture: FixtureServer;
let browser: Browser;
beforeAll(async () => { fixture = await startFixtureServer(); browser = await chromium.launch({ channel:"chrome", headless:true }); });
afterAll(async () => { await browser.close(); await fixture.close(); });

it("requires every required assertion for workflow success", async () => {
  const page = { url: () => "https://fixture.test/rta" } as never;
  const result = await evaluateAssertions(page, [
    { id:"url", type:"assertUrl", expected:"/rta", required:true },
    { id:"bad-url", type:"assertUrl", expected:"/dashboard", required:true },
    { id:"optional", type:"assertUrl", expected:"/dashboard", required:false },
  ]);
  expect(result.success).toBe(false);
  expect(result.results.map((item) => item.status)).toEqual(["passed", "failed", "failed"]);
});

it("uses collection resolution for assertCount", async () => {
  const page = await browser.newPage();
  await page.goto(`${fixture.baseUrl}/duplicate-buttons`);
  const result = await evaluateAssertions(page, [{
    id:"query-count",
    type:"assertCount",
    expected:2,
    target:{ fingerprint:{ tag:"button" }, locators:[{ strategy:"text", value:"查询", score:1 }] },
  }]);
  expect(result).toMatchObject({ success:true, results:[{ status:"passed" }] });
  await page.close();
});
