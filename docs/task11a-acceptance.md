# Task 11A: local Agent dispatch experiment

## Baseline and prerequisites

- Requested and fetched Task 10 base: `40bf3df3f6a7066b321b4c1e0dfbe2d6906fe843`; includes Task 09 `c1e6bb3cc538dc1e5458198fa82cd1b24ca0d2ed` and Task 10 `7acd39f` normally. No newer remote Task 10 commits at preflight.
- Task 10 [complete hosted CI](https://github.com/Dream-Fsh/Web-Agent-MVP/actions/runs/34802965039) succeeded for that exact head, including `npm run verify`.
- PR #3 depends on PR #2; both remain Draft/open. GitHub reviews were empty at preflight. P1-3 repair/self-check is complete, **targeted independent re-review remains pending**; CI does not close it.
- Local baseline `npm run verify`: all 157 package tests and 4 script tests passed; browser suite 11 passed / 1 failed at the initial Start of the extension-upgrade test (Recording OFF, before focus rejection/upgrade). Three unchanged isolated repeats passed.
- Prerequisite defect: content overlay exposes Start before its asynchronous initial state is available. An early click calls `draw()` with undefined state and leaves `busy` set. A deterministic test holds the initial background storage read; RED confirms Start incorrectly enabled. Fix keeps controls disabled/busy until initial state and capture are ready. No Safety or test assertion is weakened.
- A second pre-existing startup race became deterministic in the upgrade diagnostics: the first status message fails with `Could not establish connection. Receiving end does not exist.` before the new worker listener starts (3/3 diagnostic runs). Initialization now retries only this exact read-only status failure, at most 10 attempts, then fails visibly. It never retries recording mutations.
- User-owned `.codex/`, `.worktrees/` and untracked planning/audit documents are excluded. Real recordings, browser profiles and credentials are not inputs to this task.

## Release boundaries

Task 11A is a local fixture experiment, not merge/release approval. Initial popup redirect V1 acceptance remains a user decision. Historical Windows EBUSY is not confirmed fixed. No real-site pilot is started. Repair remains loopback-only, with no automatic repair/promote in Agent dispatch.

## Validation status

Prerequisite GREEN: full `npm run verify` passed (159 package tests, 4 script tests, 13 E2E), including the deterministic initialization test and unchanged extension-upgrade assertions.

## Implemented scope and evidence

- Independent metadata and create-only sealed local catalog; schema validation, pinned Workflow version/byte SHA-256, actual replay evidence, explicit enable and permanent disable. Only local fixture query/table and dashboard/title contracts with non-sensitive numeric accountId are accepted.
- Independent structured planning adapter, separate from repair. Production invokes Codex; explicit test mode uses a subprocess double and labels plans/results test-double. One subprocess per plan, 60-second limit, bounded input/output, cancellation, no raw model payload persistence. Configuration disables shell, code, browser, plugins, apps, memory and multi-agent tools; actual production-model behavior remains unverified after the failed smoke attempt.
- Program validation of known/enabled skill, version, purpose, parameter names/values grounded in task or explicit supplied values, ambiguity and missing inputs. Unsafe requests fail closed. Natural-language skill selection is delegated to the model; conservative keyword rejection is an additional guard, not a fallback planner.
- Plans expire after 15 minutes and bind Workflow bytes, parameters, skill state and permission scope. HMAC detects file modification within the local account trust boundary; it does not protect against an attacker controlling that account and its integrity key. Create-only consumption precedes browser launch, preventing silent repeat even after failure/crash. No automatic retry/recovery or activation by a model.
- Execution uses existing executeStoredRun, Safety, origin enforcement, stable page mapping, assertions and Failure Package. Results are deterministic actual RunResult summaries; no model-generated business results.
- Core tests were written before implementation; initial RED was missing Agent module, then GREEN. Additional hardening covers cancellation, concurrent confirmations, sensitive skill rejection and ambiguous null selection.
- 22 Agent unit cases cover two purposes/paraphrases/values, missing input, ambiguity, unknown skill, stale version, invented/illegal parameters, extra model fields, unsafe tasks, no-confirm/cancel, mutation/expiry/disable, fixed current-independent replay, required-assertion failure, secret-free artifacts and single consumption. Runner is explicitly mocked here.
- 2 transport tests cover separate schema invocation, sanitized request, invalid JSON, extra fields, oversized output, timeout, cancellation and unavailable subprocess. These are explicit test doubles, not real model evidence.
- Real browser E2E: Extension UI records account 10001, marks the optional variable/table/required assertion and generates a Workflow; production CLI validates and enables this plus a second dashboard skill; Agent plan uses an explicit subprocess double; confirmed production Runner replays account 20002 and verifies actual table rows and required assertion. Planning/unconfirmed/repeat commands create no extra runs. Only synthetic result/plan/validation JSON and fixture screenshot are exported; temporary profile/key/raw recording are removed.

## Real model smoke: attempted once, not passed

The user approved one call after preview of scripts/agent-model-smoke.mjs: synthetic account 20002 and two local skill descriptions, no browser operations, maximum 60 seconds. That single attempt failed without a valid planning result. No second call or fixed-answer fallback was made. Initial transport omitted raw diagnostics, so the cause is not established; later code adds only bounded fixed-category errors without exposing stderr. Real model planning and a real-model-to-browser full chain remain **pending verification**, not accepted. A new real attempt needs explicit authorization after the preview; the default npm run agent:smoke only previews.

## Final checks

Local full npm run verify passed: 183 package tests, 4 script checks and 14 browser E2E (no skips). npm run verify:extension -w @web-agent/extension passed, and README command/link checks were rerun after the status update. Actual synthetic execution returned 10 account-20002 table rows and a passed required assertion. git diff --check passed. Hosted final-head CI is recorded in the delivery report/PR after completion. No independent reviewer has closed P1-3 or approved this experiment for release.
