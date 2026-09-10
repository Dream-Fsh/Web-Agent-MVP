# Task 10 CLI Production Wiring & Stabilization

> Execution: superpowers:executing-plans, sequential TDD. No broad agent delegation.

**Goal:** Expose the verified Task 09 capabilities through a real CLI, then verify recovery and multiple browser contexts before preparing a read-only pilot.

**Architecture:** CLI parses arguments and calls existing modules. Recording Service owns Extension recording lifecycle. Runner production helpers own browser/run/failure composition without changing its execution model. Codex Adapter requests constrained patches and uses shared Workflow persistence for promotion/rollback.

**Spec:** User-pasted Task 10A–10F in this conversation (2026-09-08). Each phase must pass tests, typecheck and E2E before commit and before the next phase.

**Constraints:** No core protocol/Safety/Locator/Runner redesign. Correct only demonstrated bugs. Independent data/browser-profile; manual login. No CLI-generated Workflow, real advertising modifications, or automatic real-site repair promotion. Codex is only used on explicit repair.

## 10A — Real CLI

- [x] RED shared-pointer compatibility, rollback history and stale repair; fix old Repair persistence incompatibility through workflow-builder persistence.
- [x] RED real CLI process list/inspect/history/run/failed run/repair/rollback and argument validation; implement package helpers and binary entry.
- [x] RED login with isolated persistent profile and record process using loaded Extension visible UI; connect Recording Service lifecycle notifications without bypassing start/stop/annotation UI.
- [x] Add constrained Codex subprocess transport; validate schema/safety, replay successfully and atomically promote. Real-site promotion requires manual review.
- [x] Demonstrate CLI-generated Workflow replay with variables and outputs, save redacted Failure Package, verify all tests/typecheck/build/E2E; inspect diff and commit before 10B.

## 10B — Session recovery

- [ ] RED heartbeat, active/stale/abandoned detection, recovery audit log and new session after abandonment.
- [ ] Implement explicit recording recover without deleting lock history; verify and commit.

## 10C — Multiple contexts

- [ ] RED visible iframe input/click/extract and new-tab continuation E2E.
- [ ] Preserve frame/tab identity and wire correct frame/currentPage using existing execution primitives; verify and commit.

## 10D — Pilot preparation

- [ ] Add docs/pilot-readonly.md with allowed read actions, prohibited writes, independent profile and manual first repair review. Do not connect a real advertising site.
- [ ] Validate, review and commit.

## 10E / 10F — Documentation and CI

- [ ] Update README Quick Start and actual CLI capabilities/boundaries.
- [ ] Keep all CI checks and Extension E2E; verify hosted latest-head CI, capture CLI output/evidence, report commits and remaining limitations.
