import type { BrowserContext, Page, ElementHandle } from "@playwright/test";
import type { WorkflowStep } from '@web-agent/protocol';
import type { SafetyPolicy } from "@web-agent/safety";

export interface RunContext {
  validateTarget?: (step: WorkflowStep, element: ElementHandle) => Promise<void>;
  currentPage: Page;
  recordingStartPage?:Page;
  existingPages?:Page[];
  recordingPages?:Page[];
  browserPages?:Page[];
  recordingOwners?:Map<Page, Promise<Page|null>>;
  browserContext: BrowserContext;
  variables: Record<string, string | number | boolean>;
  outputs: Record<string, unknown>;
  downloads: string[];
  policy: SafetyPolicy;
  runId: string;
}
