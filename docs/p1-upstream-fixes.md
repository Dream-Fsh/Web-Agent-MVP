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
