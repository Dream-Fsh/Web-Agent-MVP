# P1 fixes: Task 10 integration evidence

Review baselines: Task 09 `212b8a53d9f04a62007f92f6fc3a349a5fe469ec`, Task 10 `b8131a9954137c0e3d300e638cb928fe01d280d8`. Both remote heads matched at the start of this fix session. Work was performed in isolated worktrees; no production browser profile or business data was copied.

## Changes and dependency

PR #2 receives only shared Runner/Safety origin enforcement and URL redaction (`5895521364529667c82ff226dc358f3365c66067`). Its independent full verification passed (85 package tests, 2 script checks, 4 E2E). GitHub run [34584714590](https://github.com/Dream-Fsh/Web-Agent-MVP/actions/runs/34584714590) passed for that head, testing merge `f12c39af156bf76636439b0acc58ef8d3beb0225`.

The upstream fix was normally merged into Task 10 (`2e14ef7`); PR #3 remains dependent on PR #2. No PR was merged and no history was rewritten.

- P1-1: production execution opts into blocked Service Workers and invokes the shared guarded Runner. The repair loopback restriction is unchanged. Request-stage checks cover redirect hops before destination I/O; actual page/frame checks run at operation boundaries. See [upstream evidence](p1-upstream-fixes.md).
- P1-2: recording-scoped pages have stable session identities in creation order. Closed Page objects remain tombstones. Missing identities may wait for creation; closed identities immediately fail. Unknown openers fail. Pre-existing unrelated pages do not enter this recording list. Legacy workflows without recording scope keep browser-context indices (including pre-existing pages), captured at run start and extended without reordering; closed identities remain tombstones in this scope too. A separate legacy-closure RED reproduction confirmed that preserving scope does not require preserving the unsafe live-array behavior.
- P1-3: shared redaction runs at actual raw persistence and downstream persistence boundaries. Tests use synthetic secrets only and inspect generated recording, Workflow, run and failure files, excluding profiles and test fixture source.

## Reproducible regression commands

Run `npm ci` and install Playwright Chromium first. From the repository root:

```
npm exec -w @web-agent/runner -- vitest run src/origin-regression.test.ts src/tab-identity.test.ts
npm exec -w @web-agent/recording-adapter -- vitest run src/url-regression.test.ts
npm run build
npm exec -w @web-agent/cli -- vitest run src/origin-regression.test.ts
npm run verify
```

The origin and URL tests also run independently on Task 09; tab identity and real CLI tests are Task 10 only. No test needs the review machine's temporary reproduction directory.

## RED evidence captured before implementation

The regression tests were run in isolated baseline worktrees before the fixes:

| Regression | Observed baseline failure | Fixed assertion |
| --- | --- | --- |
| Initial/explicit/single-hop/multi-hop/link/popup escape | Five negative cases reported success instead of blocked | Blocked, zero destination requests, no later effects; positive same-origin and explicit allowlist cases pass |
| Closed B in A/B/C, followed by new D | Expected rejected promise; received successful switch | B stays closed at index 1; C/D keep indices 2/3; unrelated pre-existing page is excluded |
| Actual persistRawRecording | Encoded synthetic secret remained in persisted raw data | Neither synthetic plaintext nor URL-encoded form remains; normal URL/relative path retained |
| Real production CLI multi-hop escape | Expected exit 2; received exit 0 | Exit 2, blocked, only navigation step, no outputs, zero destination requests |

Original local logs: `p1-origin-baseline-red.log`, `p1-tab-red.log`, `p1-url-red.log`, `p1-cli-red.log`. These logs are supplementary; the committed tests contain the fixtures and assertions. Synthetic secret literals are intentionally present in test source and excluded from artifact scanning.

## Boundaries and final review

Chromium/CDP is required. Service Worker execution is unsupported and blocked/rejected; this does not add cross-origin or dynamic-frame support. Unallowlisted cross-origin resources are blocked conservatively. Generic semantic detection of unknown secrets in arbitrary URL paths or ordinary text is not claimed. Stable recording indices do not migrate legacy browser-context indices. Initial popup redirects fail closed until a Page identity exists; normal same-origin popup navigation remains covered by real visible UI E2E. Model subprocess doubles in existing CI test repair wiring, not real model quality. No new real-model invocation or real-site pilot is part of this fix.

Task 10 final-head hosted CI: pending until this commit is pushed and tested. Final independent re-review: pending. Self-checks and CI do not authorize merging either PR.

## Final local follow-up

Upstream final head: `bd3a35e36056c72707b4d518bf69d81f3d764651` (includes `5895521`). Its full local verification now passes 90 package tests, 2 script checks and 4 E2E. The prior hosted run linked above is historical and does not validate this additional commit; [new Task 09 run](https://github.com/Dream-Fsh/Web-Agent-MVP/actions/runs/34586674134) must finish for the final upstream head.

Task 10 full local `npm run verify` passes 116 package tests, 4 script checks and all 10 E2E, including unchanged real Extension UI iframe/new-tab and production CLI record/run/repair/rollback flows. Typecheck and the Runner suite were repeated after the legacy-scope tombstone addition. Scanning the 44 retained generated JSON/NDJSON/text/HTML E2E artifacts found no synthetic plaintext or encoded secret markers; actual persistence regression tests also scan their transient outputs before cleanup. This scan excludes browser profiles, fixture source, and supplementary RED failure logs.

Additional RED evidence: `p1-frame-red.log`, `p1-popup-red.log`, `p1-url-normalized-red.log` (3 failures), `p1-legacy-tab-red.log`. Corrections preserve existing test assertions and do not skip visible UI E2E. The first-popup redirect fail-closed boundary above remains explicit. Final Task 10 hosted CI and independent re-review remain pending at document commit time.
