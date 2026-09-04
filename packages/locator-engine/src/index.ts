import type { Locator, Page } from "@playwright/test";
import type { LocatorCandidate, Target } from "@web-agent/protocol";

export interface DiscoveredCandidate {
  candidate: LocatorCandidate;
  locator: Locator;
  priority: number;
}

export interface ResolvedTarget {
  locator: Locator;
  candidate: LocatorCandidate;
  confidence: number;
  matchCount: 1;
}

export type TargetResolutionCode = "AMBIGUOUS_TARGET" | "NO_TARGET_MATCH" | "INVALID_LOCATOR";

export class TargetResolutionError extends Error {
  public constructor(public readonly code: TargetResolutionCode, message: string, public readonly candidates: Array<{ candidate: LocatorCandidate; matchCount: number }> = []) {
    super(message);
    this.name = "TargetResolutionError";
  }
}

const strategyPriority: Record<LocatorCandidate["strategy"], number> = {
  testId:0, role:1, label:2, placeholder:3, attribute:4, text:5, css:6,
};

function assertSafeCss(value: string): void {
  if (/^\s*(xpath\s*=|\/\/)/i.test(value)) {
    throw new TargetResolutionError("INVALID_LOCATOR", "XPath is not permitted in the locator engine");
  }
}

function locatorFor(page: Page, target: Target, candidate: LocatorCandidate): Locator {
  switch (candidate.strategy) {
    case "testId": return page.getByTestId(candidate.value);
    case "role": {
      if (!target.fingerprint.role) throw new TargetResolutionError("INVALID_LOCATOR", "Role candidates require target.fingerprint.role");
      return page.getByRole(target.fingerprint.role as Parameters<Page["getByRole"]>[0], { name:candidate.value, exact:true });
    }
    case "label": return page.getByLabel(candidate.value, { exact:true });
    case "placeholder": return page.getByPlaceholder(candidate.value, { exact:true });
    case "attribute": {
      const [name, ...parts] = candidate.value.split("=");
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new TargetResolutionError("INVALID_LOCATOR", "Attribute candidates require a safe attribute name");
      const value = parts.join("=");
      return value ? page.locator(`[${name}=${JSON.stringify(value)}]`) : page.locator(`[${name}]`);
    }
    case "text": return page.getByText(candidate.value, { exact:true });
    case "css": assertSafeCss(candidate.value); return page.locator(candidate.value);
  }
}

/** Discovers protocol candidates in the fixed stability order. */
export function discoverCandidates(page: Page, target: Target): DiscoveredCandidate[] {
  return [...target.locators]
    .sort((left, right) => strategyPriority[left.strategy] - strategyPriority[right.strategy] || right.score - left.score)
    .map((candidate) => ({ candidate, locator:locatorFor(page, target, candidate), priority:strategyPriority[candidate.strategy] }));
}

function confidence(candidate: DiscoveredCandidate): number {
  const priorityConfidence = 1 - candidate.priority / Object.keys(strategyPriority).length;
  return Math.min(1, candidate.candidate.score * 0.5 + priorityConfidence * 0.4 + 0.1);
}

/**
 * Resolves only a unique runtime match. It intentionally never calls
 * Locator.first(): ambiguity is a surfaced condition, not a hidden choice.
 */
export async function resolveTarget(page: Page, target: Target): Promise<ResolvedTarget> {
  const diagnostics: Array<{ candidate: LocatorCandidate; matchCount: number }> = [];
  for (const discovered of discoverCandidates(page, target)) {
    const matchCount = await discovered.locator.count();
    diagnostics.push({ candidate:discovered.candidate, matchCount });
    if (matchCount === 1) return { locator:discovered.locator, candidate:discovered.candidate, confidence:confidence(discovered), matchCount:1 };
  }
  if (diagnostics.some(({ matchCount }) => matchCount > 1)) {
    throw new TargetResolutionError("AMBIGUOUS_TARGET", "No locator candidate identified a unique target", diagnostics);
  }
  throw new TargetResolutionError("NO_TARGET_MATCH", "No locator candidate matched the current page", diagnostics);
}
