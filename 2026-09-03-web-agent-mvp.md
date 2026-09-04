# Web Agent Recorder MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Do not implement multiple tasks in one unreviewed change.

## Goal

构建一个 Windows 本地运行的 Web Automation Recorder。

用户在已经登录的广告后台演示一次网页操作后：

```
Record
→ Raw Events
→ Normalize
→ Workflow DSL
→ Generic Runner
→ Playwright
→ Assertions / Extraction
→ Result
```

页面发生小规模变化时：

```
Runner Failure
→ Failure Package
→ Codex
→ Repair Patch
→ Validation
→ Workflow New Version
```

Codex 不参与普通 Workflow 的每次执行，只参与：

- Workflow 理解
- 参数建议
- Failure Diagnosis
- Repair Patch
- 复杂流程扩展

------

# Tech Stack

```
Windows 10 / Windows 11

Node.js:
24 LTS

Language:
TypeScript

Workspace:
npm workspaces

Browser automation:
Playwright 1.62.1

Validation:
Zod + JSON Schema

Testing:
Vitest
Playwright Test

Chrome Extension:
Manifest V3
TypeScript
Vite

Storage:
JSON / NDJSON

CLI:
Node.js CLI
```

V1 不引入数据库。

------

# Global Constraints

1. V1 只支持 Chromium / Chrome。
2. V1 只支持浏览器网页，不支持 Windows 桌面软件。
3. Workflow 是系统核心协议。
4. Playwright Script 不是系统核心协议。
5. 正常 Workflow 执行不得调用 Codex。
6. Codex 不得直接覆盖正式 Workflow。
7. AI 修复必须输出 Repair Patch。
8. Repair Patch 必须经过自动验证才能形成 Workflow 新版本。
9. 默认 `safeMode=read-only`。
10. 不记录 password、cookie、authorization token、敏感 localStorage。
11. 不使用固定 sleep 作为默认等待机制。
12. XPath 不作为首选 Locator。
13. Locator 命中多个候选元素时不得猜测点击。
14. Workflow 必须包含 assertion 才可以标记运行成功。
15. V1 不实现 OCR。
16. V1 不实现 Vision 点击。
17. V1 不实现验证码绕过。
18. V1 不实现 Windows 桌面自动化。
19. V1 不允许自动执行 destructive 操作。
20. 所有核心能力必须有 Fixture Site 自动化测试。

------

# Repository Structure

```
web-agent/
│
├── apps/
│   ├── extension/
│   │   ├── src/
│   │   │   ├── background/
│   │   │   ├── content/
│   │   │   ├── popup/
│   │   │   └── shared/
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── fixture-site/
│       ├── src/
│       └── package.json
│
├── packages/
│   ├── workflow/
│   ├── recorder-core/
│   ├── normalizer/
│   ├── locator-engine/
│   ├── runner/
│   ├── extractor/
│   ├── assertions/
│   ├── safety/
│   ├── failure/
│   └── codex-adapter/
│
├── workflows/
├── data/
│   ├── browser-profile/
│   ├── recordings/
│   ├── runs/
│   └── failures/
│
├── tests/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── architecture/
│   └── workflows/
│
├── package.json
├── tsconfig.base.json
└── README.md
```

------

# Task 01 — Repository Foundation

## Deliverable

建立可编译、可测试的 npm workspace。

## Files

Create:

```
package.json
tsconfig.base.json
.gitignore
README.md

apps/extension/package.json
apps/cli/package.json
apps/fixture-site/package.json

packages/workflow/package.json
packages/recorder-core/package.json
packages/normalizer/package.json
packages/locator-engine/package.json
packages/runner/package.json
packages/extractor/package.json
packages/assertions/package.json
packages/safety/package.json
packages/failure/package.json
packages/codex-adapter/package.json
```

## Root scripts

必须提供：

```
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test:e2e": "playwright test",
    "verify": "npm run typecheck && npm test && npm run test:e2e"
  }
}
```

## Acceptance

运行：

```
npm install
npm run typecheck
npm test
```

全部返回 exit code 0。

## Commit

```
git commit -m "chore: initialize web agent workspace"
```

------

# Task 02 — Workflow Core

## Deliverable

定义系统最重要的数据协议。

## Package

```
packages/workflow
```

## Required Types

必须建立：

```
Workflow
WorkflowMetadata
WorkflowVariable
WorkflowStep
Target
LocatorCandidate
Assertion
Extraction
RiskLevel
```

核心定义：

```
export type StepType =
  | "navigate"
  | "click"
  | "input"
  | "select"
  | "waitFor"
  | "switchTab"
  | "extract"
  | "assert"
  | "download";
```

风险类型：

```
export type RiskLevel =
  | "safe"
  | "write"
  | "destructive";
```

Workflow：

```
export interface Workflow {
  schemaVersion: "1.0";
  id: string;
  version: number;
  name: string;

  startUrl: string;

  variables: Record<string, WorkflowVariable>;

  steps: WorkflowStep[];

  metadata: WorkflowMetadata;
}
```

Locator：

```
export interface LocatorCandidate {
  strategy:
    | "testId"
    | "role"
    | "label"
    | "placeholder"
    | "attribute"
    | "text"
    | "css";

  value: string;

  score: number;
}
```

Target：

```
export interface Target {
  fingerprint: {
    tag?: string;
    role?: string;
    text?: string;
    nearbyText?: string[];
  };

  locators: LocatorCandidate[];
}
```

## Validation

使用 Zod。

建立：

```
parseWorkflow(input: unknown): Workflow
```

非法 Workflow 必须抛：

```
WorkflowValidationError
```

禁止：

```
schemaVersion missing
step id duplicated
empty locators
score < 0
score > 1
```

## Tests

至少测试：

```
valid workflow
invalid version
duplicated step ID
invalid locator score
missing target
unknown step type
```

## Acceptance

```
npm test -w packages/workflow
```

PASS。

## Commit

```
git commit -m "feat: define workflow DSL"
```

------

# Task 03 — Fixture Website

## Goal

任何 Recorder 和 Runner 功能都不能直接拿真实广告后台当测试环境。

建立：

```
apps/fixture-site
```

模拟一个广告后台。

## Pages

必须拥有：

```
/login
/dashboard
/rta
/rta/:id
/dynamic
/modal
/pagination
/spa
/iframe
```

RTA 页面包含：

```
账户ID input
查询 button

策略ID
策略名称
状态

table
pagination
```

例如：

```
账户ID：
10001

查询结果：

策略ID     名称       状态
RTA001    test-a     生效中
RTA002    test-b     已暂停
```

## Dynamic Page

每次加载随机改变 CSS class。

例如：

```
btn-x71
btn-a28
btn-z19
```

但是：

```
role
accessible name
text
```

保持不变。

用于证明系统没有依赖脆弱 CSS。

## Acceptance

Playwright Test：

```
fixture loads
search works
pagination works
modal works
SPA navigation works
dynamic CSS changes
iframe renders
```

全部 PASS。

## Commit

```
git commit -m "test: add automation fixture site"
```

------

# Task 04 — Raw Event Recorder

## Package

```
packages/recorder-core
```

和：

```
apps/extension
```

## Raw Event Schema

```
interface RawEvent {
  id: string;

  sessionId: string;

  timestamp: number;

  type:
    | "click"
    | "input"
    | "change"
    | "navigation"
    | "tab-change";

  url: string;

  frame: {
    frameId: number;
    framePath: string[];
  };

  element?: ElementSnapshot;

  value?: string;
}
```

ElementSnapshot：

```
interface ElementSnapshot {
  tag: string;

  text?: string;

  role?: string;

  ariaLabel?: string;

  label?: string;

  placeholder?: string;

  testId?: string;

  attributes: Record<string, string>;

  nearbyText: string[];
}
```

## Security

下面这些值绝对不得记录：

```
input[type=password]
Authorization
Cookie
Set-Cookie
access_token
refresh_token
session token
```

如果元素是 password：

```
{
  "value": "[REDACTED]"
}
```

## Storage

每次 Recording：

```
data/recordings/<sessionId>/
```

保存：

```
raw-events.ndjson
metadata.json
```

## Extension Controls

V1 popup 只需要：

```
开始录制
停止录制
录制状态
事件数量
```

不要做复杂 UI。

## Acceptance

用户：

```
click account input
type 12345
click query
```

产生 Raw Event。

password value 不得存在于任何文件。

## Commit

```
git commit -m "feat: record browser interaction events"
```

------

# Task 05 — Event Normalizer

## Package

```
packages/normalizer
```

核心 API：

```
normalizeEvents(events: RawEvent[]): NormalizedAction[]
```

## Required Rules

输入：

```
focus input
Ctrl+A
Backspace
type 1
type 12
type 123
type 1234
```

输出：

```
input accountId = 1234
```

以下事件删除：

```
mouse movement
empty body click
duplicated click
temporary input events
irrelevant focus
```

Navigation 不能因为：

```
pushState
replaceState
popstate
```

而丢失。

## Test

必须测试：

```
merge input events
remove duplicate clicks
retain meaningful click
SPA route change
multiple inputs
tab change
```

## Acceptance

Fixture：

```
输入账号
→ 查询
```

最终最多形成：

```
input
click
navigation/wait
```

而不是几十个 raw events。

## Commit

```
git commit -m "feat: normalize recorded browser events"
```

------

# Task 06 — Locator Engine

## Package

```
packages/locator-engine
```

这是 V1 最重要模块之一。

## API

```
resolveTarget(
  page: Page,
  target: Target
): Promise<ResolvedTarget>
```

返回：

```
interface ResolvedTarget {
  locator: Locator;

  strategy: string;

  confidence: number;
}
```

错误：

```
TargetNotFoundError
AmbiguousTargetError
```

## Priority

默认：

```
data-testid
↓
role + accessible name
↓
label
↓
placeholder
↓
stable attributes
↓
text
↓
CSS
```

不要生成 XPath 执行策略。

XPath 只能作为诊断信息。

## Critical Rule

找到：

```
1 个高置信元素
```

才执行。

如果：

```
query button
query account button
query campaign button
```

同时符合条件：

必须：

```
throw AmbiguousTargetError
```

不得随机取：

```
locator.first()
```

解决问题。

## Confidence

例如：

```
testId exact        1.00
role + name exact   0.95
label exact         0.92
placeholder         0.88
stable attr         0.85
text exact          0.80
css                 0.60
```

这些值集中维护：

```
locatorScores.ts
```

禁止散落代码。

## Acceptance

Fixture 动态改变 CSS class 后：

```
查询按钮
```

仍然能定位。

存在两个相同按钮时：

```
AMBIGUOUS_TARGET
```

## Commit

```
git commit -m "feat: add resilient locator engine"
```

------

# Task 07 — Generic Workflow Runner

## Package

```
packages/runner
```

核心 API：

```
runWorkflow(
  workflow: Workflow,
  variables: Record<string, unknown>,
  options: RunOptions
): Promise<RunResult>
```

## Browser Profile

使用：

```
data/browser-profile/
```

作为专门 Automation Profile。

禁止默认连接用户日常 Chrome Profile。

CLI：

```
web-agent login
```

行为：

```
launchPersistentContext
↓
用户手动登录
↓
关闭
↓
保存 automation profile
```

执行：

```
web-agent run rta-check
```

复用该 profile。

## Step Executors

建立独立 executor：

```
navigate.ts
click.ts
input.ts
select.ts
waitFor.ts
switchTab.ts
download.ts
```

不要实现一个 1000 行：

```
runner.ts
```

## Waiting

禁止默认：

```
page.waitForTimeout(3000)
```

使用：

```
locator.waitFor()
page.waitForURL()
expect(locator).toBeVisible()
```

## Run Result

```
interface RunResult {
  runId: string;

  workflowId: string;

  startedAt: string;
  finishedAt: string;

  status:
    | "success"
    | "failed"
    | "blocked";

  steps: StepRunResult[];

  outputs: Record<string, unknown>;
}
```

## Acceptance

Fixture：

```
input account ID
click query
wait result
```

全程不调用 Codex。

## Commit

```
git commit -m "feat: execute workflows with playwright"
```

------

# Task 08 — Assertions

## Package

```
packages/assertions
```

必须实现：

```
assertVisible
assertText
assertUrl
assertCount
assertAttribute
```

例如：

```
{
  "type": "assert",
  "condition": {
    "kind": "text",
    "target": {},
    "expected": "策略列表"
  }
}
```

## Critical Rule

Runner：

```
步骤全部执行完
```

不等于：

```
SUCCESS
```

必须：

```
required Assertions PASS
```

才允许 RunResult：

```
success
```

## Acceptance

页面错误地显示：

```
账户不存在
```

即使查询按钮点击成功：

Workflow 必须 FAILED。

## Commit

```
git commit -m "feat: validate workflow outcomes"
```

------

# Task 09 — Extraction Engine

## Package

```
packages/extractor
```

支持：

```
extractText
extractAttribute
extractList
extractTable
extractCount
```

API：

```
extract(
  page: Page,
  extraction: Extraction
): Promise<unknown>
```

## Table

必须支持：

```
normal HTML table
pagination
```

V1 暂不承诺通用虚拟列表。

遇到 virtualized table：

```
UNSUPPORTED_VIRTUAL_TABLE
```

不要 silently 返回当前 viewport 数据。

## Example

输入：

```
策略ID
状态
```

输出：

```
[
  {
    "strategyId": "RTA001",
    "status": "生效中"
  }
]
```

## Acceptance

Fixture 两页表格：

```
page1 = 10
page2 = 10
```

如果设置：

```
pagination=true
```

必须返回 20 行。

## Commit

```
git commit -m "feat: extract structured page data"
```

------

# Task 10 — Safety Engine

## Package

```
packages/safety
```

API：

```
classifyStep(step: WorkflowStep): RiskLevel
```

以及：

```
assertStepAllowed(
  step: WorkflowStep,
  policy: SafetyPolicy
): void
```

默认：

```
{
  mode: "read-only"
}
```

## Safe

允许：

```
查询
搜索
打开详情
翻页
下载
读取
切换 tab
```

## Write

默认阻止：

```
保存
修改
编辑
创建
提交
启用
暂停
```

## Destructive

始终阻止 V1 自动执行：

```
删除
清空
支付
确认付款
永久关闭
```

错误：

```
UnsafeActionBlockedError
```

## Important

Safety Check 必须发生于：

```
Locator Resolve
↓
Safety
↓
Action
```

Action 前。

## Acceptance

Fixture：

```
删除广告
```

即使 Locator 100% 命中：

Runner 仍返回：

```
blocked
```

## Commit

```
git commit -m "feat: enforce automation safety policy"
```

------

# Task 11 — Failure Package

## Package

```
packages/failure
```

失败生成：

```
data/failures/<runId>/<stepId>/
```

内容：

```
failure.json
screenshot.png
trace.zip
dom-context.json
target.json
workflow.snapshot.json
```

禁止保存：

```
完整 Cookie
Authorization
password
browser storage dump
```

DOM 保存失败元素附近上下文。

API：

```
createFailurePackage(
  context: FailureContext
): Promise<FailurePackage>
```

## Acceptance

故意删除 Fixture 查询按钮。

运行失败后：

```
failure package exists
screenshot exists
target exists
workflow snapshot exists
```

并扫描文件：

```
password
Authorization
Cookie
```

不得出现实际 Secret。

## Commit

```
git commit -m "feat: capture sanitized workflow failures"
```

------

# Task 12 — Repair Patch Protocol

## Package

```
packages/codex-adapter
```

Codex 不得返回：

```
新的完整 Workflow 文件
```

只能返回：

```
interface WorkflowRepairPatch {
  workflowId: string;

  baseVersion: number;

  stepId: string;

  reason: string;

  confidence: number;

  changes: RepairChange[];
}
```

Example：

```
{
  "workflowId": "rta-check",
  "baseVersion": 3,
  "stepId": "step-004",
  "reason": "button accessible name changed",
  "confidence": 0.96,
  "changes": [
    {
      "operation": "replaceLocator",
      "from": {
        "role": "button",
        "name": "查询"
      },
      "to": {
        "role": "button",
        "name": "立即查询"
      }
    }
  ]
}
```

## Allowed Patch Types

V1：

```
replaceLocator
addLocator
removeLocator
updateWaitCondition
```

禁止 AI：

```
insert destructive action
delete assertion
change safety policy
change start URL domain
```

## Validation

建立：

```
validateRepairPatch()
applyRepairPatch()
```

流程：

```
failure
↓
Codex patch
↓
schema validation
↓
safety validation
↓
temporary workflow
↓
Fixture / target replay
↓
PASS
↓
new version
```

## Acceptance

未经验证：

```
workflow.json
```

绝不能被修改。

## Commit

```
git commit -m "feat: add constrained workflow repair patches"
```

------

# Task 13 — Workflow Versioning

Workflow：

```
workflows/rta-check/
```

保存：

```
v1.json
v2.json
v3.json
current.json
```

`current.json` 可以保存：

```
{
  "currentVersion": 3
}
```

API：

```
loadWorkflowVersion()
saveWorkflowVersion()
promoteWorkflowVersion()
rollbackWorkflow()
```

必须支持：

```
web-agent workflow history rta-check
web-agent workflow rollback rta-check 2
```

## Acceptance

创建：

```
v1
v2
v3
```

rollback 到：

```
v2
```

以后执行默认读取 v2。

## Commit

```
git commit -m "feat: version recorded workflows"
```

------

# Task 14 — Parameter Review

不要让 Codex自动决定：

```
119939093
```

是不是变量。

建立 Recorder 后处理结果：

```
interface VariableSuggestion {
  stepId: string;

  originalValue: string;

  suggestedName: string;

  confidence: number;
}
```

用户确认：

```
119939093
→ accountId
```

以后 Workflow：

```
{{accountId}}
```

## Secret Variable

支持：

```
sensitive: true
```

值只在 Runtime 注入。

Workflow 文件不得保存 Secret。

## Acceptance

Workflow JSON 搜索实际 Secret：

```
0 matches
```

## Commit

```
git commit -m "feat: parameterize recorded workflow values"
```

------

# Task 15 — Chrome Recorder Controls

Extension 最终 V1 UI：

```
● Recording

Events: 12

[停止录制]

--------------------------------

候选变量：
119939093 → accountId

[确认]

--------------------------------

提取字段

[标记当前元素]
```

只实现：

```
Start
Stop
Status
Variable mark
Extraction mark
```

不要实现：

```
workflow editor
dashboard
visual programming
AI chat
```

这些属于后续版本。

## Commit

```
git commit -m "feat: add minimal recorder controls"
```

------

# Task 16 — CLI

建立：

```
apps/cli
```

最终必须支持：

```
web-agent login

web-agent record

web-agent workflow list

web-agent workflow inspect rta-check

web-agent run rta-check --var accountId=12345

web-agent run rta-check --input accounts.json

web-agent failures list

web-agent repair <runId>

web-agent workflow history rta-check

web-agent workflow rollback rta-check 2
```

V1 不需要 GUI Runner。

CLI 是主要开发和调试入口。

## Acceptance

完整 Demo：

```
web-agent login

web-agent run rta-check --var accountId=10001
```

输出：

```
Workflow: rta-check
Version: 1

step-001 input       PASS
step-002 click       PASS
step-003 waitFor     PASS
step-004 extract     PASS
step-005 assertion   PASS

Result:
RTA001    生效中
RTA002    已暂停

Status: SUCCESS
```

## Commit

```
git commit -m "feat: expose web agent CLI"
```

------

# Task 17 — Complete E2E Scenario

建立完整测试。

Scenario：

```
1. Fixture CSS = version A

2. Recorder 录制：
   输入账户
   查询
   提取 table

3. Normalize

4. 生成 Workflow

5. Runner PASS

6. Fixture 切换 CSS = version B

7. Runner 应继续 PASS
   因为 role/name 没变

8. Fixture 把：
   查询
   改成：
   立即查询

9. Runner FAILED

10. Failure Package generated

11. Repair Patch generated

12. Temporary Workflow verified

13. Promote v2

14. Runner PASS
```

这是整个 MVP 最重要的验收测试。

文件：

```
tests/e2e/record-run-repair.spec.ts
```

## Commit

```
git commit -m "test: verify record run repair lifecycle"
```

------

# Definition of Done

MVP 只有满足下面条件才算完成：

```
[ ] Chrome 能录制真实点击/输入

[ ] Raw Event 可以保存

[ ] Raw Event 可以 Normalize

[ ] 可以生成合法 Workflow DSL

[ ] Workflow 有 Schema Validation

[ ] Locator 支持多候选

[ ] CSS 改变不会轻易破坏 Workflow

[ ] Ambiguous Locator 会停止

[ ] Runner 不依赖 Codex

[ ] Runner 使用独立 Browser Profile

[ ] 可以读取已登录网站

[ ] 支持 Assertions

[ ] 支持 Table Extraction

[ ] 支持 Pagination

[ ] 默认 Read-only

[ ] Write 操作默认 Block

[ ] Destructive 操作 Block

[ ] Failure Package 不泄露 Secret

[ ] Codex只能生成 Repair Patch

[ ] Repair Patch必须验证

[ ] Workflow支持版本

[ ] Workflow可以 rollback

[ ] Fixture E2E全部 PASS

[ ] npm run verify PASS
```

------

# Phase 2 — Explicitly Out of Scope

以下内容不要让 Codex 在 MVP 中提前开发：

```
OCR

Vision Agent

屏幕坐标点击

Windows UI Automation

验证码破解

Closed Shadow DOM

复杂 Canvas

跨桌面软件操作

AI完全自主浏览网页

云端执行

多人账号权限

数据库

复杂 Dashboard

流程拖拽编辑器

移动端浏览器

Firefox

Safari
```

这些等 V1 稳定以后再评估。

------

# Codex Execution Rules

Codex 必须遵守：

```
一次只执行一个 Task。

每个 Task：

读取相关文件
↓
写 failing test
↓
运行确认 FAIL
↓
实现最小功能
↓
运行测试
↓
运行 typecheck
↓
检查 diff
↓
commit
↓
进入下一 Task
```

不得：

```
一次生成整个项目

跳过 Fixture Test

跳过测试

为了让测试通过而删除测试

使用 .first() 绕过 Locator ambiguity

使用大量 waitForTimeout

直接修改正式 Workflow

记录 password/token

在 V1 实现 Vision/OCR
```

每完成一个 Task，输出：

```
Task:
Files changed:
Tests added:
Tests result:
Typecheck:
Commit:
Remaining risks:
```

------

# Final Verification

最后必须运行：

```
npm run typecheck
npm test
npm run test:e2e
npm run build
```

最后再运行：

```
npm run verify
```

只有全部 exit code 0 才能声称：

```
MVP complete
```

否则必须报告具体失败项，不得声明完成。