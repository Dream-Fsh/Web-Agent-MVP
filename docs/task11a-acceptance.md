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

Implementation and final-head verification pending. Real model smoke testing requires a separate explicit confirmation of the synthetic payload; test doubles cannot establish real model quality.
