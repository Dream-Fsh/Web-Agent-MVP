# Task 11A independent fixes (2026-09-15)

Baseline: `2c818639b8e07f0cfd550ae1d329bb53908ecb21`.
Production planner configuration remains **unfixed / blocking real-model validation**. Provider and retry flags are frozen. No real plan, smoke, repair, provider probe or business-site operation is part of this round. Historical real-model failure cause remains undetermined.

## Text credential leak

Shared Safety now recognizes HTTP(S), protocol-relative and percent-encoded URL envelopes in ordinary strings and table cells. Markdown boundaries separate candidates. Userinfo with TAB/CR/LF is treated as one candidate; malformed C0/backslash forms fail closed. Structured URL fields retain their previous URL cleanup and additionally sanitize embedded text candidates; normalization is idempotent. Relative paths, variable definitions and ordinary text remain supported. This does not promise arbitrary unlabeled secret detection or unbounded nested encodings.

The exact U+0000 Markdown and U+0001 protocol-relative/backslash review counterexamples were added as repository regressions before the fix. On isolated old shared SHA `c1e6bb3cc538dc1e5458198fa82cd1b24ca0d2ed`, 4 text cases failed and 6 controls passed. These were actual failed leak assertions, not compilation failures. Subsequent read-disk tests exposed embedded prose in href and a non-idempotent encoded field; both were corrected without dropping assertions.

Actual writers tested: persistRawRecording, saveWorkflow for legacy input, Failure Package DOM and Workflow snapshot. The real-browser Task 11 test extracts title strings and table cells, runs production Agent CLI with an explicit planner double, reads RunResult and signed Agent result files, checks stdout/stderr, required-assertion failure artifacts, and preserves table/account values. Deliberately secret-bearing test inputs are synthetic and never sent to a model.

## Account false success

The local fixture contract now requires an effective account input → query → table extraction order. Navigation, tab change and unrelated mutating interactions invalidate consumption. Top-level fixture only. Runtime checks require exact fixture headers and each returned strategy-name cell to contain the confirmed numeric account and matching row strategy ID. No model inference or input echo is accepted as identity evidence.

Registration's actual replay must satisfy identity and existing required assertions. Contract revision 2 is signed into skills and plans. Old records require explicit revalidation/registration under a new ID; no user Workflow rewriting or automatic activation occurs.

The Agent records taskValidation.accountIdentity separately from the unchanged underlying RunResult. Default/wrong/missing account results fail the Agent and exit CLI with code 2 even if Runner steps completed. Two normal accounts and dashboard title remain supported. Failed plans stay consumed.

Old isolated Task 11 produced 8 failed assertions for missing/metadata/unrelated/no-query/late/reset consumption and incorrect result identity. New tests additionally cover old signed records, no-browser failure, and actual default/wrong/missing tables through real CLI/browser execution.

## Safe diagnostics

PlannerError carries a strict fixed diagnostic: category, phase, exitCode (or null), elapsedMs. Raw stderr is transient, bounded and discarded; only closed categories are passed upstream. Unknown stays unknown, and no CLI version/auth/network guesses are introduced. Agent CLI exposes the sanitized structure instead of swallowing it. Provider selection, incompatible retry flags and authentication forwarding were not changed.

Offline doubles cover configuration rejection, startup failure, timeout, cancellation, invalid output and unknown failure, plus upper-layer CLI propagation and synthetic-secret absence. The isolated old version failed 5 diagnostic assertions. Test mode without an explicit command cannot fall back to PATH Codex. CI preload blocks actual Codex process launches for both planning and repair.

## Evidence and validation

Local preserved evidence directory: `D:/Fsh/task11a-fixes-20260915/`.
- `text-RED.log`, `account-RED.log`, `diagnostic-RED.log`: isolated old-baseline failed assertions.
- `text-final-GREEN.log`, `account-diagnostic-GREEN.log`: targeted checks (later full runs include the active-cancel addition).
- `task09-verify-final.log`, `task10-verify-final.log`, `task11-verify-final.log`: final full verification, status to be read from actual logs/delivery report, not assumed by this document.
- `browser-fixes.log` / exported browser evidence: actual RunResult, signed results, CLI output, account comparisons and failure snapshot read.

Original review, prior test outputs and account 90009 preview were preserved. Production data, profiles and integrity keys are not committed. Initial direct build-script invocation failed because npm environment was missing; rerunning via npm was an environment correction, not a security RED or weakened test.

Final branch SHAs and hosted CI are recorded in the delivery report. Self-check is not independent closure, real model acceptance or permission to merge. Pending boundaries remain: popup first-redirect acceptance, Windows EBUSY, real-site pilot not started, repair loopback-only, orphan Agent lock recovery, active cancel-command limitation and conservative negated-request rejection.
