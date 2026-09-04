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

export interface ResolvedCollectionTarget {
  locators: Locator[];
  candidates: Array<{ candidate: LocatorCandidate; matchCount: number }>;
}

export type TargetResolutionCode = "LOCATOR_CONFLICT" | "AMBIGUOUS_TARGET" | "NO_TARGET_MATCH" | "INVALID_LOCATOR";

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

interface CandidateMatch {
  discovered: DiscoveredCandidate;
  matchCount: number;
  identities: string[];
}

interface IdentityMatch {
  identity: string;
  locator: Locator;
  discovered: DiscoveredCandidate;
  confidence: number;
}

async function resolveElementIdentities(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((elements) => {
    const scope = globalThis as typeof globalThis & {
      __webAgentLocatorIdentityStore__?: WeakMap<Element, string>;
      __webAgentLocatorIdentitySequence__?: number;
    };
    const store = scope.__webAgentLocatorIdentityStore__ ??= new WeakMap<Element, string>();
    let sequence = scope.__webAgentLocatorIdentitySequence__ ?? 0;
    const identities = elements.map((element) => {
      let identity = store.get(element);
      if (!identity) {
        sequence += 1;
        identity = `dom-${sequence}`;
        store.set(element, identity);
      }
      return identity;
    });
    scope.__webAgentLocatorIdentitySequence__ = sequence;
    return identities;
  });
}

async function collectCandidateMatches(page: Page, target: Target): Promise<CandidateMatch[]> {
  const matches: CandidateMatch[] = [];
  for (const discovered of discoverCandidates(page, target)) {
    const matchCount = await discovered.locator.count();
    matches.push({
      discovered,
      matchCount,
      identities: matchCount === 0 ? [] : await resolveElementIdentities(discovered.locator),
    });
  }
  return matches;
}

function diagnostics(matches: CandidateMatch[]): Array<{ candidate: LocatorCandidate; matchCount: number }> {
  return matches.map(({ discovered, matchCount }) => ({ candidate:discovered.candidate, matchCount }));
}

function identityMatches(matches: CandidateMatch[]): IdentityMatch[] {
  return matches.flatMap(({ discovered, identities }) => identities.map((identity, index) => ({
    identity,
    locator: discovered.locator.nth(index),
    discovered,
    confidence: confidence(discovered),
  })));
}

/**
 * Resolves only a unique runtime match. It intentionally never calls
 * Locator.first(): ambiguity is a surfaced condition, not a hidden choice.
 */
export async function resolveCollectionTarget(page: Page, target: Target): Promise<ResolvedCollectionTarget> {
  const matches = await collectCandidateMatches(page, target);
  const resolved = identityMatches(matches);
  if (resolved.length === 0) {
    throw new TargetResolutionError("NO_TARGET_MATCH", "No locator candidate matched the current page", diagnostics(matches));
  }

  const unique = new Map<string, Locator>();
  for (const match of resolved) unique.set(match.identity, match.locator);
  return { locators:[...unique.values()], candidates:diagnostics(matches) };
}

/**
 * Resolves a single DOM element only after every protocol candidate has been
 * evaluated and clustered by DOM identity. It intentionally never calls
 * Locator.first(): ambiguity is surfaced instead of silently hidden.
 */
export async function resolveSingleTarget(page: Page, target: Target): Promise<ResolvedTarget> {
  const matches = await collectCandidateMatches(page, target);
  const resolved = identityMatches(matches);
  if (resolved.length === 0) {
    throw new TargetResolutionError("NO_TARGET_MATCH", "No locator candidate matched the current page", diagnostics(matches));
  }

  const groups = new Map<string, IdentityMatch[]>();
  for (const match of resolved) {
    const group = groups.get(match.identity) ?? [];
    group.push(match);
    groups.set(match.identity, group);
  }
  const ranked = [...groups.values()]
    .map((group) => ({ group, confidence:Math.max(...group.map((match) => match.confidence)) }))
    .sort((left, right) => right.confidence - left.confidence);
  const highestConfidence = ranked[0]!.confidence;
  const highConfidenceGroups = ranked.filter(({ confidence: candidateConfidence }) => candidateConfidence >= highestConfidence - 0.15);

  if (highConfidenceGroups.length > 1) {
    const candidateKeys = new Set(highConfidenceGroups.flatMap(({ group }) => group.map(({ discovered }) => discovered)));
    const code: TargetResolutionCode = candidateKeys.size > 1 ? "LOCATOR_CONFLICT" : "AMBIGUOUS_TARGET";
    throw new TargetResolutionError(code, "High-confidence locator candidates did not converge on one DOM target", diagnostics(matches));
  }

  const selected = ranked[0]!.group
    .slice()
    .sort((left, right) => left.discovered.priority - right.discovered.priority || right.confidence - left.confidence)[0]!;
  return {
    locator:selected.locator,
    candidate:selected.discovered.candidate,
    confidence:selected.confidence,
    matchCount:1,
  };
}

/** @deprecated Use resolveSingleTarget or resolveCollectionTarget explicitly. */
export const resolveTarget = resolveSingleTarget;
