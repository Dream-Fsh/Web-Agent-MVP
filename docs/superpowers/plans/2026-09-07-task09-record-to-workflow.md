# Task 09 Record-to-Workflow implementation plan

**Goal:** A user demonstrates a query using the visible Extension UI, and the generated, versioned Workflow replays successfully.

**Spec:** User-provided Task 09A–09E, README, CI requirements in this task. Stop before Task 10 and all real-site work.

**Architecture:** Extension-owned overlay → runtime messages → recorder-core → redacted recording storage. Formal annotations remain separate. A local recording service composes Normalizer, Workflow Builder and atomic Workflow persistence. The Generic Runner consumes the generated file.

**Global constraints:** Sequential TDD; no fixture recording controls; no direct Workflow construction in UI or final E2E; no locator.first or timeout synchronization; no secrets persisted; no ordinary Codex execution; commit after each verified stage.

## 09A: Visible recording controls
- Files: extension content entry, service-worker entry, popup; recorder-core session state; tests/recorder-ui.e2e.spec.ts.
- [x] Write and observe failing loaded-extension UI test (missing visible start button).
- [ ] Implement start/stop, status/count and separate preliminary marks using serialized runtime messages.
- [ ] Validate sensitive data storage and stopped capture in Chromium.
- [ ] Run typecheck, unit tests, E2E, build, verify; review diff and commit.

## 09B: Formal annotations
- Files: protocol annotation schema; recorder-core annotation validation; recording-adapter persistence and tests.
- [ ] RED: invalid schemas/action references; three annotation types; secret value omitted.
- [ ] Implement parseRecordingAnnotation and session/action validation; independent annotations.json.
- [ ] Verify complete suite, review and commit.

## 09C: Workflow Builder
- Files: packages/workflow-builder; normalizer supported operations; package dependency configuration and tests.
- [ ] RED: RawEvent → normalizeEvents → buildWorkflow → parseWorkflow; variables remove original literal; unique IDs, frame, ordering and unsupported inputs.
- [ ] Implement pure buildWorkflow(actions, annotations, metadata), validate output.
- [ ] Verify complete suite, review and commit.

## 09D: Versioned persistence
- Files: workflow-builder persistence module and disk tests.
- [ ] RED: v1/v2, duplicate/invalid rejection, current pointer, interrupted write.
- [ ] Validate and stage version file before atomic current pointer promotion, reject competing writers.
- [ ] Verify complete suite, review and commit.

## 09E: Complete visible UI E2E
- Files: recording service composition, Extension stop integration, tests/record-to-workflow.e2e.spec.ts; narrowly required runner/fixture behavior.
- [ ] RED: UI start → input 10001 → query → UI variable/extract/assert marks → UI stop → generated file → Runner success.
- [ ] Wire automatic normalization/build/persistence and actual table extraction.
- [ ] Read generated artifacts for assertions; save representative evidence.
- [ ] Verify complete suite, review and commit.

## README
- [ ] Document architecture, supported behavior, loading/recording/replay, safety, V1 limits and commands from tested implementation; review and commit.

## CI
- [ ] Reproduce clean installation/build checks, implement reproducible dependency ordering as needed.
- [ ] PR/push main CI executes all requested commands including Extension E2E with Chromium.
- [ ] Verify locally; inspect hosted run if publishing is available; report any unverified remote status. Review and commit.
