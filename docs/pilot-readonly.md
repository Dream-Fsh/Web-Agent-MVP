# Production Pilot Checklist — 只读试点准备

状态：尚未启动真实广告后台试点。本文是准备与验收清单，不构成真实站点操作授权。Task 10 本地与 CI 验收后停止汇报，待用户单独指定站点、账户、查询范围并人工授权。

## 开始前

- [ ] 确认指定站点与账户、时间范围、输出字段、下载目录；选取无修改副作用的查询场景。
- [ ] 核对目标域名与现有 Safety allowlist；不为让测试通过而放宽 Safety。
- [ ] 使用项目独立 `data/browser-profile/`，禁止复用、复制或连接日常 Chrome profile。
- [ ] 用户在 `npm exec -- web-agent login --url <URL>` 打开的独立浏览器内手动登录；关闭浏览器后再录制，避免 profile 同时占用。
- [ ] 不录制登录；不向 CLI、聊天或配对面板提供密码、token、cookie。浏览器 profile 会保留认证 cookie 等登录态，是敏感本地目录；不得上传或提交。录制文件与 Failure Package 不得包含这些凭据。
- [ ] 先完成本地 fixture 的录制、重放、失败包与恢复验证。检查 [上下文边界](task10c-contexts.md) 和 [恢复说明](task10b-recovery.md)。

## 允许操作

仅允许 navigate、查询、搜索、打开详情、翻页、读取、提取、断言、下载。下载必须是已有报表的读取；若触发创建任务或其他写操作则暂停，不能仅凭按钮名称判定为只读。

## 禁止操作

禁止保存业务配置、修改预算、创建、发布、启停、删除、支付，以及任何 write / destructive 操作。即使录制者曾点击过，也不构成重放授权。遇到确认写入弹窗、未知动作语义、账号不匹配或权限变化，停止并报告。

## 一次演示与重放

1. 保持目标查询服务可访问。用 `npm exec -- web-agent record --url <URL>` 启动 Extension 与本地保存服务；按终端提示在真实 popup 配对。
2. 通过可见 overlay 开始录制，演示只读查询；标记查询变量、结果 extraction 与 required assertion，再通过 UI 停止。
3. 确认自动产生脱敏 RawEvent、独立 Annotation、NormalizedAction，以及 `workflows/<id>/v1.json`；用 workflow inspect 检查目标、域名、变量和每一步语义。
4. 用户确认录制内容在已授权只读范围内后，执行 `npm exec -- web-agent run <id> --var accountId=<ID>`。
5. 核对账户与业务结果、required assertions、outputs 和下载。只有 RunResult.status 为 success 且结果经过人工核对，才记录该场景通过。
6. 页面轻微变化的失败演练必须是受控测试，不修改真实后台配置来制造失败。验证 Failure Package 的原因、失败步骤与脱敏证据；缺少证据时记录 gap，不能把重试成功当作修复证明。

## 失败与修复

- 出现失败即停止当前场景，不盲目循环点击。通过 `npm exec -- web-agent failures list` 找到 Failure Package，保留原始 Workflow 版本与 RunResult。
- 首次真实站点 Repair 必须人工 review，且不得自动 promote。当前 CLI repair 仅允许本地 loopback 场景，不提供真实站点修复发布入口；不要修改代码或冒充本地域名绕过限制。
- 后续真实修复需另行授权的审查流程：脱敏失败证据 → 候选 Patch → schema / Safety validation → 人工 review → 获授权的只读 replay → 人工确认版本发布。任一项缺失就维持原 current 版本。
- 进程异常终止后运行 `npm exec -- web-agent recording recover`；仅在 owner 已退出且 heartbeat 超时后恢复，保留 audit 与 abandoned 历史，不手工删除锁。活动 owner 不可抢占。

## 验收记录

记录授权范围、Workflow ID / version、RunId、执行时间、变量名（不记录 secret）、断言结果、输出核对结果、下载路径、失败证据路径和人工审查结论。对外分享前检查脱敏，profile 与真实业务数据不进入 CI artifact 或 Git。

已验证本地能力见 [CLI 验收](task10a-acceptance.md)。跨域 frame、动态 frame、虚拟表格及复杂控件未验收；不以本地 fixture 成功代替真实站点验证。

准备阶段验证：2026-09-10，文档检查先因文件缺失 FAIL，补齐后 PASS；npm run verify PASS（typecheck、100 个包单元测试、3 个脚本检查、10 个 E2E）。这仅验收准备材料，不代表真实站点试点通过。
