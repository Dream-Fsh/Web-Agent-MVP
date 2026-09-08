# Task 09 Record-to-Workflow implementation plan

**Goal:** A user demonstrates a query using the visible Extension UI, and the generated, versioned Workflow replays successfully.

**Spec:** User-provided Task 09A–09E, README, CI requirements in this task. Stop before Task 10 and all real-site work.

**Architecture:** Extension-owned overlay → runtime messages → recorder-core → redacted recording storage. Formal annotations remain separate. A local recording service composes Normalizer, Workflow Builder and atomic Workflow persistence. The Generic Runner consumes the generated file.

**Global constraints:** Sequential TDD; no fixture recording controls; no direct Workflow construction in UI or final E2E; no locator.first or timeout synchronization; no secrets persisted; no ordinary Codex execution; commit after each verified stage.

## 09A: Visible recording controls
- Files: extension content entry, service-worker entry, popup; recorder-core session state; tests/recorder-ui.e2e.spec.ts.
- [x] Write and observe failing loaded-extension UI test (missing visible start button).
- [x] Implement start/stop, status/count and separate preliminary marks using serialized runtime messages.
- [x] Validate sensitive data storage and stopped capture in Chromium.
- [x] Run typecheck, unit tests, E2E, build, verify; review diff and commit (`4b79f75`).

## 09B: Formal annotations
- Files: protocol annotation schema; recorder-core annotation validation; recording-adapter persistence and tests.
- [x] RED: invalid schemas/action references; three annotation types; secret value omitted.
- [x] Implement parseRecordingAnnotation and session/action validation; independent annotations.json.
- [x] Verify complete suite, review and commit (`eae8cb6`).

## 09C: Workflow Builder
- Files: packages/workflow-builder; normalizer supported operations; package dependency configuration and tests.
- [x] RED: RawEvent → normalizeEvents → buildWorkflow → parseWorkflow; variables remove original literal; unique IDs, frame, ordering and unsupported inputs.
- [x] Implement pure buildWorkflow(actions, annotations, metadata), validate output.
- [x] Verify complete suite, review and commit (`36be855`).

## 09D: Versioned persistence
- Files: workflow-builder persistence module and disk tests.
- [x] RED: v1/v2, duplicate/invalid rejection, current pointer, interrupted write.
- [x] Validate and stage version file before atomic current pointer promotion, reject competing writers.
- [x] Verify complete suite, review and commit.

## 09E: Complete visible UI E2E
- Files: recording service composition, Extension stop integration, tests/record-to-workflow.e2e.spec.ts; narrowly required runner/fixture behavior.
- [x] RED: UI start → input 10001 → query → UI variable/extract/assert marks → UI stop → generated file → Runner success.
- [x] Wire automatic normalization/build/persistence and actual table extraction.
- [x] Read generated artifacts for assertions; save representative evidence.
- [x] Verify complete suite, review and commit.

## README
- [x] Document architecture, supported behavior, loading/recording/replay, safety, V1 limits and commands from tested implementation; review and commit.

## CI
- [x] Reproduce clean installation/build checks, implement reproducible dependency ordering as needed.
- [x] PR/push main CI executes all requested commands including Extension E2E with Chromium.
- [x] Verify locally; hosted CI passed: https://github.com/Dream-Fsh/Web-Agent-MVP/actions/runs/34175924517 (implementation head 089d0b7). Reviewed and committed; main requires verify, including admins.
