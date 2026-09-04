import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { startFixtureServer, type FixtureServer } from "@web-agent/fixture-site";
import { UnsupportedVirtualTableError, assertSupportedTable, extractPaginatedTable } from "./index.js";

let fixture: FixtureServer;
let browser: Browser;
beforeAll(async () => { fixture = await startFixtureServer(); browser = await chromium.launch({ channel:"chrome", headless:true }); });
afterAll(async () => { await browser.close(); await fixture.close(); });

it("rejects virtualized tables rather than returning viewport-only rows", async () => {
  const table = { evaluate: async (callback: (element: { getAttribute: (name: string) => string | null; hasAttribute: (name: string) => boolean }) => unknown) => callback({ getAttribute:(name) => name === "aria-rowcount" ? "100" : null, hasAttribute:(name) => name === "data-virtualized" }) } as never;
  await expect(assertSupportedTable(table)).rejects.toBeInstanceOf(UnsupportedVirtualTableError);
});

it("extracts every HTML-table pagination page through URL conditions", async () => {
  const page = await browser.newPage();
  await page.goto(`${fixture.baseUrl}/pagination`);
  const table = { fingerprint:{ tag:"table" }, locators:[{ strategy:"css" as const, value:"table", score:1 }] };
  const next = { fingerprint:{}, locators:[{ strategy:"css" as const, value:'a[rel="next"]', score:1 }] };
  await expect(extractPaginatedTable(page, table, next)).resolves.toMatchObject({ headers:["策略ID", "策略名称", "状态"], rows:expect.arrayContaining([expect.arrayContaining(["RTA001"]), expect.arrayContaining(["RTA011"])]) });
  await page.close();
});
