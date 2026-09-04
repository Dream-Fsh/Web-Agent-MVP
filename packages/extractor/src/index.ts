import type { Locator, Page } from "@playwright/test";
import type { Target } from "@web-agent/protocol";
import { resolveCollectionTarget, resolveSingleTarget } from "@web-agent/locator-engine";

export class UnsupportedVirtualTableError extends Error { public constructor() { super("UNSUPPORTED_VIRTUAL_TABLE"); this.name = "UnsupportedVirtualTableError"; } }

export async function assertSupportedTable(table: Locator): Promise<void> {
  const virtual = await table.evaluate((element) => element.hasAttribute("data-virtualized") || element.getAttribute("aria-rowcount") !== null);
  if (virtual) throw new UnsupportedVirtualTableError();
}

export async function extractText(page: Page, target: Target): Promise<string> { const resolved = await resolveSingleTarget(page, target); return (await resolved.locator.textContent()) ?? ""; }
export async function extractAttribute(page: Page, target: Target, attribute: string): Promise<string | null> { const resolved = await resolveSingleTarget(page, target); return resolved.locator.getAttribute(attribute); }
export async function extractList(page: Page, target: Target): Promise<string[]> { const resolved = await resolveCollectionTarget(page, target); return Promise.all(resolved.locators.map(async (locator) => (await locator.textContent()) ?? "")); }
export async function extractCount(page: Page, target: Target): Promise<number> { const resolved = await resolveCollectionTarget(page, target); return resolved.locators.length; }

export interface ExtractedTable { headers: string[]; rows: string[][] }
export async function extractTable(page: Page, target: Target): Promise<ExtractedTable> {
  const resolved = await resolveSingleTarget(page, target);
  await assertSupportedTable(resolved.locator);
  return {
    headers: await resolved.locator.locator("thead th").allTextContents(),
    rows: await resolved.locator.locator("tbody tr").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""))),
  };
}

/** Extracts complete HTML-table pagination using navigation conditions, never sleeps. */
export async function extractPaginatedTable(page: Page, tableTarget: Target, nextTarget: Target, maxPages = 100): Promise<ExtractedTable> {
  const aggregate: ExtractedTable = { headers:[], rows:[] };
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const current = await extractTable(page, tableTarget);
    if (!aggregate.headers.length) aggregate.headers = current.headers;
    else if (aggregate.headers.join("\u0000") !== current.headers.join("\u0000")) throw new Error("Table headers changed during pagination");
    aggregate.rows.push(...current.rows);
    let next;
    try { next = await resolveSingleTarget(page, nextTarget); } catch { break; }
    const previousUrl = page.url();
    await Promise.all([
      page.waitForURL((url) => url.href !== previousUrl),
      next.locator.click(),
    ]);
    await page.waitForLoadState("domcontentloaded");
  }
  return aggregate;
}
