import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import type { ElementSnapshot, RawEvent, Workflow } from "@web-agent/protocol";
import { createCapturedEvent, recordCapturedEvent } from "@web-agent/recorder-core";
import { normalizeEvents } from "@web-agent/normalizer";
import { runWorkflow } from "@web-agent/runner";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";

let fixture: FixtureServer;
let browser: Browser;
beforeAll(async () => { fixture = await startFixtureServer(); browser = await chromium.launch({ channel:"chrome", headless:true }); });
afterAll(async () => { await browser.close(); await fixture.close(); });

const queryElement = (): ElementSnapshot => ({ tag:"button", role:"button", accessibleName:"查询", attributes:{ "data-testid":"query" }, nearbyText:[], locatorCandidates:[{ strategy:"testId", value:"query", score:1 }, { strategy:"role", value:"查询", score:0.9 }, { strategy:"css", value:"button.btn-a12", score:0.3 }] });
const workflow = (startUrl: string, element: ElementSnapshot): Workflow => ({ schemaVersion:"1.0", id:"dynamic-query", version:1, name:"dynamic query", startUrl, variables:{}, metadata:{ createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" }, steps:[{ id:"query", type:"click", target:{ fingerprint:{ role:"button" }, locators:element.locatorCandidates } }] });

it("records redacted RawEvent, normalizes it, and replays after dynamic CSS changes", async () => {
  const persisted: RawEvent[] = [];
  const raw = createCapturedEvent({ sessionId:"session", url:`${fixture.baseUrl}/dynamic?token=secret`, frame:{ frameId:0, framePath:[] } }, { id:"click", timestamp:1, type:"click", element:queryElement() });
  recordCapturedEvent(raw, (event) => persisted.push(event));
  const normalized = normalizeEvents(persisted);
  expect(persisted[0].url).not.toContain("token");
  expect(normalized).toHaveLength(1);
  const page = await browser.newPage();
  await runWorkflow(page, workflow(`${fixture.baseUrl}/dynamic`, normalized[0].element!));
  await runWorkflow(page, workflow(`${fixture.baseUrl}/dynamic`, normalized[0].element!));
  await page.close();
});

it("fails safely on ambiguous and destructive targets", async () => {
  const page = await browser.newPage();
  const ambiguous = await runWorkflow(page, { ...workflow(`${fixture.baseUrl}/duplicate-buttons`, { ...queryElement(), locatorCandidates:[{ strategy:"text", value:"查询", score:1 }] }), id:"ambiguous" });
  expect(ambiguous).toMatchObject({ status:"failed", steps:[{ status:"failed" }] });
  const destructive = await runWorkflow(page, { ...workflow(`${fixture.baseUrl}/write-actions`, { ...queryElement(), locatorCandidates:[{ strategy:"text", value:"删除广告", score:1 }] }), id:"delete" });
  expect(destructive).toMatchObject({ status:"blocked", steps:[{ status:"blocked" }] });
  await page.close();
});
