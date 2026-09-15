# Task 10A — CLI Production Wiring 验收

本阶段只接线现有能力。CLI 不构造 Workflow、不重新实现 Runner / Safety / Locator；普通录制和执行不调用 Codex。

## 已接入命令

从仓库运行 `npm exec -- web-agent <command>`；命令入口为 `apps/cli/bin/web-agent.mjs`。

| 命令 | 实际能力 |
| --- | --- |
| `login [--url URL]` | 打开独立 `data/browser-profile/`，用户手动登录，关闭浏览器结束；禁用密码管理器 |
| `record [--url URL]` | 启动 Recording Service、加载已构建 Extension；用户在 popup 配对，通过 overlay 开始、标注、停止；自动输出 Workflow 文件路径 |
| `workflow list` | 读取实际 current 版本及更新时间 |
| `workflow inspect <id>` | 读取完整合法 Workflow |
| `workflow history <id>` | 列出保留的版本 |
| `run <id> --var accountId=10001` | 调用 Generic Runner，保存脱敏 RunResult 和实际失败包；失败退出码 2 |
| `failures list` | 读取 Failure Package 的运行、步骤、原因、时间 |
| `repair <runId>` | Codex CLI 返回受限 Patch，经 schema / Safety / 浏览器 replay 后保存新版本 |
| `workflow rollback <id> <version>` | 原子更新 current 指针，保留历史版本 |

可选 `--root DIR` 指定应用数据根目录；`--headless` 用于测试和无界面运行；`run --json` 输出 RunResult。`--cdp-port` 仅为本地测试诊断入口。关闭录制浏览器后 CLI 退出；点击停止录制后会立即输出生成路径。

## TDD 与真实链路证据

- 先复现旧 Repair 存储格式与 Task 09 current 指针不兼容，再统一调用 Workflow persistence。
- 先验证 CLI placeholder、缺失生命周期通知、缺失生产运行/模型通道，再接线实现。
- `tests/cli-production.e2e.spec.ts` 使用真实 CLI 子进程、已构建 Extension、可见按钮与 fixture。录制产生 v1 后，CLI 重跑成功；模拟 locator 漂移产生实际 Failure Package，再 replay / promote v2 / rollback v1。
- CI 中模型供应方为明确标注的子进程替身，仅验证接线，不冒充实际 Codex 调用。
- 本地另用默认 Codex CLI 对同一 UI 录制产物进行真实修复：运行 `27894213-92cc-42ac-a082-e25e30d264fe`，Workflow `edfa22f1-1991-4a3f-9738-5500af181608`，`Replay: PASS` 后保存 v4，保留 v1 / v2 / v3。
- Runner 的浏览器测试文件串行执行：新增真实浏览器套件并发时，原有 5 秒用例曾超时；单文件与串行全套均通过，未增加固定等待或跳过测试。
- 代码审查发现并通过 RED/GREEN 修复：数值秘密脱敏、取消信号传递、本地修复重定向边界、秘密与协议字段数值相同时的快照合法性。
- 运行时秘密只清洗数据载荷；Workflow 快照保留未绑定模板并移除敏感默认值。真实站点自动修复被拒绝；本地 replay 的网络请求和重定向受限，Service Worker 被禁用。

本地证据位于被 Git 忽略的 `data/task10a-evidence/`，包含真实 Codex 输出、Workflow 历史及失败包。E2E 截图和 CLI 演示输出位于 `test-results/`；测试会移除浏览器 profile，避免进入 CI 工件。

## 本阶段边界

- 录制会话异常恢复、profile 占用及遗留写锁属于 10B；不能声明已解决。
- 跨 frame / 多标签闭环属于 10C；本阶段未宣称支持完整验证。
- 真实站点不自动 replay / promote 修复；未连接广告后台。
- 默认模型通道依赖本机 Codex 已安装、已认证及服务可用；调用失败时不升级 Workflow。
- Pilot 文档、README 最终更新和最新提交的托管 CI 验收属于 10D–10F。

## 验证记录

2026-09-10 最终验收：npm run build PASS；npm run verify PASS（typecheck、92 项单元测试、2 项构建测试、6 项真实浏览器 E2E 全部通过）。代码审查重要问题均已修复，git diff --check PASS。
