import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";
import { resolveTarget } from "./index.js";

let fixture: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  fixture = await startFixtureServer();
  browser = await chromium.launch({ channel:"chrome", headless:true });
});
afterAll(async () => { await browser.close(); await fixture.close(); });

it("resolves a unique target by stable priority rather than dynamic CSS", async () => {
  const page = await browser.newPage();
  await page.goto(`${fixture.baseUrl}/dynamic`);
  const resolved = await resolveTarget(page, {
    fingerprint:{ role:"button" },
    locators:[
      { strategy:"css", value:"button.btn-stale", score:1 },
      { strategy:"role", value:"查询", score:0.9 },
      { strategy:"testId", value:"query", score:0.7 },
    ],
  });
  expect(resolved.candidate.strategy).toBe("testId");
  expect(resolved.matchCount).toBe(1);
  expect(await resolved.locator.textContent()).toBe("查询");
  await page.close();
});

it("reports AMBIGUOUS_TARGET instead of selecting the first repeated element", async () => {
  const page = await browser.newPage();
  await page.goto(`${fixture.baseUrl}/duplicate-buttons`);
  await expect(resolveTarget(page, { fingerprint:{ tag:"button" }, locators:[{ strategy:"text", value:"查询", score:0.8 }] })).rejects.toMatchObject({ code:"AMBIGUOUS_TARGET" });
  await page.close();
});

it("rejects XPath-shaped CSS input at the engine boundary", async () => {
  const page = await browser.newPage();
  await page.goto(`${fixture.baseUrl}/dynamic`);
  await expect(resolveTarget(page, { fingerprint:{}, locators:[{ strategy:"css", value:"xpath=//button", score:1 }] })).rejects.toMatchObject({ code:"INVALID_LOCATOR" });
  await page.close();
});
