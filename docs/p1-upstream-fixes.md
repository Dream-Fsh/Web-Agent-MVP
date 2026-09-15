# P1 upstream fixes (Task 09)

Scope: review baseline 212b8a5; only origin escape (P1-1) and URL persistence (P1-3). Task 10 is not imported into this branch.

## P1-1

The previous Safety gate validated a declared navigate URL, but the browser followed redirects outside the allowlist. Regression tests confirmed start navigation, explicit single/multi-hop redirects, links and popups escaped before this change (five failing cases).

Runner now uses the shared Safety origin decision before initial navigation, at Chromium Fetch request-stage interception (including every redirect hop), and before/after operations against the actual page and frames. It never derives allowed origins from destinations. A context route holds a popup's first navigation until that target is guarded. Browser Service Worker bypass is enabled, HTTP workers already present are rejected, and new registrations are blocked. Chromium/CDP is required; unsupported guard installation fails closed. This is not new cross-origin frame feature support.

A one-hop route.fetch/fulfill approach and Network URL blocking were tested and rejected: multi-hop regression still observed a destination request. The committed implementation does not rely on either approach or automatic HTTP redirect following.

Positive tests retain same-origin input and explicitly allowlisted redirects. Negative tests require zero destination requests, blocked status, and no later input/extraction/assertion outputs. An existing HTTP Service Worker is rejected before workflow navigation.

## P1-3

Raw DOM href/src/action/formaction URL attributes bypassed the old suffix-only URL recognition; URL userinfo also survived. The actual persistRawRecording regression failed before the fix. The shared redactor now handles URL attributes, absolute/protocol-relative/relative URLs, userinfo, query strings, malformed URLs, and URL strings embedded in diagnostics. Simple fragment anchors remain supported; parameterized or encoded fragments are omitted conservatively.

The persistence test uses only synthetic secrets and checks decoded/encoded forms after reading raw-events.ndjson. Existing recording, locator, Builder and visible UI tests remain in the full verify suite. Unknown secrets in arbitrary non-URL path/text content remain outside automatic semantic recognition.

## Evidence

- packages/runner/src/origin-regression.test.ts
- packages/recording-adapter/src/url-regression.test.ts
- RED logs: p1-origin-baseline-red.log (5 failed), p1-url-red.log (1 failed), captured in the local temporary evidence directory.
- Independent re-review of final SHAs remains pending. No real advertising site was visited; neither PR is authorized for merge.
Local final verify PASS: typecheck, 85 package tests, 2 build checks, 4 real Extension/integration E2E. git diff --check PASS. Hosted final-head CI remains pending until push.

Follow-up integration regression: a child frame can temporarily expose an empty Playwright URL before document commit. The guard now resolves that transient value from the actual document, without changing network interception or allowed origins. A local same-origin iframe regression was confirmed RED (`p1-frame-red.log`) then GREEN (`p1-frame-green.log`, all 8 origin cases). The prior 85-test / hosted CI evidence above applies only to 5895521; this follow-up requires fresh full verification and final-head hosted CI.

Final follow-up also covers browser-normalized URL attributes (leading whitespace, protocol-relative and backslash authority spellings): 3 additional persistence cases reproduced the credential leak before normalization and pass after it. The same-origin popup positive regression exposed Playwright's unavailable Frame on its first navigation. That first request is now origin-checked and fetched with maxRedirects=0; redirect responses stop before following any hop. Once Page identity exists, CDP interception is installed. Initial popup redirects, including same-origin ones, are explicitly unsupported and fail closed; normal same-origin popup navigation and later guarded redirects are supported. This conservative limit avoids both unguarded redirects and falsifying the final document URL by proxying a whole redirect chain. Tests do not loosen origin policy. Final full verification and hosted CI must cover this follow-up, not the earlier run.

Follow-up local final verification PASS: typecheck, 90 package tests, 2 script checks, build and 4 real Extension/integration E2E; diff check PASS. Final-head hosted CI pending push.

## C0 follow-up (2026-09-13, P1-3 only)

Independent re-review left P1-3 blocking at `bd3a35e36056c72707b4d518bf69d81f3d764651` (Task 09) and `f33fdc2bd0d00b7e331413226c812700297d6f98` (Task 10). URL parsing ignored leading C0 characters, while absolute/network-path classification retained them. The relative reconstruction branch then returned the original credential-bearing authority after the parsed URL's userinfo had been cleared.

The fix normalizes leading/trailing C0 and space, removes browser-ignored TAB/CR/LF, and normalizes backslashes before both classification and parsing. Remaining internal C0 characters and unsupported embedded absolute URLs are redacted as a whole. Absolute/network-path output comes from the sanitized parsed URL; only genuine relative paths retain their normalized relative spelling. The virtual parsing base cannot become a persisted destination. `saveWorkflow` now validates, redacts and validates again before publishing any version, including old-format input supplied directly to the writer.

Regression sources:
- `packages/safety/src/c0-regression.test.ts`: all U+0000–U+001F prefixes, absolute/network paths, mixed whitespace/backslashes, idempotence and relative/rejection controls.
- `packages/workflow-builder/src/c0-persistence.test.ts`: actual recording → normalization → Builder → version-file chain and independent legacy Workflow saving. Both retain temporary artifacts and read the produced files; synthetic plaintext, percent-encoded and double-encoded markers are checked. Fixture source and deliberately secret-bearing RED inputs are not claimed clean.

Local evidence directory: `C:/Users/zlsj/AppData/Local/Temp/web-agent-c0-fix-evidence`.
- `task09-red-safety.log`: 28 failed / 5 passed on bd3a35e before the change.
- `old-fixed-red-chain.log`: both corrected persistence tests fail on the unmodified f33fdc2 implementation shared with bd3a35e, after writing credential-bearing v1 files.
- The earlier `task09-red-persistence.log` has one genuine legacy-save failure and one fixture validation error (`navigate` instead of RawEvent `navigation`); the latter is not vulnerability evidence.
- Final full verification and final-head hosted CI must be recorded after execution; prior CI is historical only. Independent targeted re-review remains pending.

Initial popup redirects: **已确认兼容性收缩，V1 接受决定待用户确认**. This follow-up does not expand popup support or change P1-1/P1-2 implementation. Unknown secrets in ordinary path/text content are not claimed detectable. No real site or real model is used.
Final C0 test revision: `old-final-tests-red-safety.log` reports 29 failures / 5 passes (34 cases), and `old-final-tests-red-persistence.log` reports both actual persistence cases failing on the unchanged f33fdc2 baseline. The literal pasted Markdown/backslash forms are included. Generated GREEN artifacts are retained under the `wa-c0-chain-*` / `wa-c0-legacy-*` temporary paths printed in `task09-final-verify.log`; the final suite contains 126 package tests. Hosted final-head CI and targeted independent re-review remain pending at commit time.
Final local C0 verification: npm run verify PASS (exit 0): typecheck, 126 package tests, 2 script checks, build, and all 4 unchanged real Extension/integration E2E. Diff check PASS. No cleanup EBUSY occurred in this Task 09 run.
Additional self-check found scheme-qualified forms such as https:report could inherit the virtual base. task09-base-red.log confirms the failing assertion. Absolute forms now parse without any base; only relative input uses the virtual base. Final tests include this control and require fresh full verification and CI for the follow-up SHA.
The new writer boundary also exposed a related regression: generic redaction treated a variable named password as a secret payload and erased its schema definition. task09-variables-red.log confirms the validation failure. redactWorkflow now preserves variable flags while omitting sensitive defaults; the regression retains a normal accountId default and verifies the saved file contains no synthetic secret.
Final follow-up verification: task09-final2-verify.log PASS (exit 0), 128 package tests, 2 script checks, all 4 real Extension/integration E2E. Final typecheck and targeted 35 Safety + 3 persistence tests also PASS after all edits. The prior e1ef053 CI success does not validate this follow-up; fresh final-head CI is required.
