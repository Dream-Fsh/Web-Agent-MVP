import type { BrowserContext, Page } from "@playwright/test";
import type { SafetyPolicy } from "@web-agent/safety";

export interface RunContext {
  currentPage: Page;
  browserContext: BrowserContext;
  variables: Record<string, string | number | boolean>;
  outputs: Record<string, unknown>;
  downloads: string[];
  policy: SafetyPolicy;
  runId: string;
}
