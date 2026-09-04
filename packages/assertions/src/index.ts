import type { Page } from "@playwright/test";
import type { Target } from "@web-agent/protocol";
import { resolveTarget } from "@web-agent/locator-engine";

export type AssertionType = "assertVisible" | "assertText" | "assertUrl" | "assertCount" | "assertAttribute";
export interface Assertion { id: string; type: AssertionType; target?: Target; expected?: string | number; attribute?: string; required?: boolean }
export interface AssertionResult { id: string; status: "passed" | "failed"; required: boolean; message?: string }

export async function evaluateAssertions(page: Page, assertions: Assertion[]): Promise<{ success: boolean; results: AssertionResult[] }> {
  const results: AssertionResult[] = [];
  for (const assertion of assertions) {
    try {
      if (assertion.type === "assertUrl") {
        if (typeof assertion.expected !== "string" || !page.url().includes(assertion.expected)) throw new Error(`URL did not include ${assertion.expected}`);
      } else {
        if (!assertion.target) throw new Error(`${assertion.type} requires a target`);
        const target = await resolveTarget(page, assertion.target);
        if (assertion.type === "assertVisible" && !await target.locator.isVisible()) throw new Error("Target is not visible");
        if (assertion.type === "assertText" && (typeof assertion.expected !== "string" || !(await target.locator.textContent() ?? "").includes(assertion.expected))) throw new Error("Target text did not match");
        if (assertion.type === "assertCount" && (typeof assertion.expected !== "number" || await target.locator.count() !== assertion.expected)) throw new Error("Target count did not match");
        if (assertion.type === "assertAttribute" && (typeof assertion.expected !== "string" || !assertion.attribute || await target.locator.getAttribute(assertion.attribute) !== assertion.expected)) throw new Error("Target attribute did not match");
      }
      results.push({ id:assertion.id, status:"passed", required:assertion.required ?? true });
    } catch (error) { results.push({ id:assertion.id, status:"failed", required:assertion.required ?? true, message:error instanceof Error ? error.message : String(error) }); }
  }
  return { results, success:!results.some((result) => result.required && result.status === "failed") };
}
