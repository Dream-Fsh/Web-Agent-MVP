import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";

import { startFixtureServer } from "./index.js";

let baseUrl = "";
let close: () => Promise<void>;

beforeAll(async () => {
  ({ baseUrl, close } = await startFixtureServer());
});

afterAll(async () => {
  await close();
});

async function page(path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`);
  expect(response.status).toBe(200);
  return response.text();
}

describe("fixture ad console", () => {
  it("serves every required fixture route", async () => {
    for (const path of ["/login", "/dashboard", "/rta", "/dynamic", "/duplicate-buttons", "/pagination", "/modal", "/spa", "/iframe", "/nested-iframe", "/write-actions"]) {
      await page(path);
    }
  });

  it("keeps the dynamic query button accessible while its CSS class changes", async () => {
    const first = await page("/dynamic");
    const second = await page("/dynamic");
    expect(first).toContain('role="button" aria-label="查询"');
    expect(second).toContain('role="button" aria-label="查询"');
    expect(first.match(/class="(btn-[^"]+)"/)?.[1]).not.toBe(second.match(/class="(btn-[^"]+)"/)?.[1]);
  });

  it("provides ambiguity, write-action, pagination, modal, SPA, and nested-frame fixtures", async () => {
    await expect(page("/duplicate-buttons")).resolves.toContain("查询账户");
    await expect(page("/duplicate-buttons")).resolves.toContain("查询广告");
    await expect(page("/duplicate-buttons")).resolves.toContain("查询计划");
    await expect(page("/write-actions")).resolves.toContain("删除广告");
    await expect(page("/pagination?page=2")).resolves.toContain("RTA011");
    await expect(page("/pagination")).resolves.toContain('/pagination?page=2');
    await expect(page("/iframe")).resolves.toContain("iframe");
    await expect(page("/nested-iframe")).resolves.toContain("/iframe");
  });

  it("escapes query values and supports modal, SPA, and nested-frame interactions", async () => {
    const escaped = await page(`/rta?accountId=${encodeURIComponent('<script>alert(1)</script>')}`);
    expect(escaped).not.toContain("<script>alert(1)</script>");

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const browserPage = await browser.newPage();
    await browserPage.goto(`${baseUrl}/modal`);
    await browserPage.getByRole("button", { name: "打开筛选弹窗" }).click();
    expect(await browserPage.locator("dialog[open]").count()).toBe(1);
    await browserPage.goto(`${baseUrl}/spa`);
    await browserPage.getByRole("button", { name: "打开详情" }).click();
    expect(browserPage.url()).toBe(`${baseUrl}/spa/detail`);
    expect(await browserPage.locator("#view").textContent()).toBe("详情");
    await browserPage.goto(`${baseUrl}/nested-iframe`);
    const outer = browserPage.frameLocator('iframe[title="外层 frame"]');
    const inner = outer.frameLocator('iframe[title="账户选择器"]');
    expect(await inner.getByRole("button", { name: "选择账户" }).count()).toBe(1);
    await browser.close();
  });
});
