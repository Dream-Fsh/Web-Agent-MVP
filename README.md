# Web Agent

本地网页操作录制与重跑。用户通过 Chrome Extension 演示查询并标注变量、提取和必需断言，停止后自动生成版本化 Workflow，由 Generic Runner 执行。

## 当前架构

```text
Extension popup（仅配对）+ 网页 recorder overlay（操作与标注）
  → Chrome runtime message passing → recorder-core → Safety / Redaction
  → 本地 recording-service → Recording Adapter → Normalizer
  → Workflow Builder → parseWorkflow → workflows/<id>/v1.json
  → Generic Runner → Safety + Locator Engine + Assertions + Extractor
  → RunResult（status、outputs、downloads）
```

RawEvent 与 RecordingAnnotation 独立保存。UI 不构造 Workflow Step；Builder 不依赖 Extension 或 Codex。CLI 解析参数后调用现有 packages；Codex Adapter 仅在显式 repair 时生成受限 Patch，不参与普通录制、生成或执行。

## 已完成功能与项目状态

Completed：Protocol、Fixture、Safety / Redaction、Recorder Core、Recording Adapter、RecordingAnnotation、Normalizer、Locator Engine、Generic Runner、Assertions、Extraction、Workflow Builder、版本化 Workflow Persistence、Failure Package、验证后 Repair Patch、Integration Hardening、可见 Record-to-Workflow E2E。

Current：CLI Production Wiring & Stabilization。10A–10D 已提交，10D 本地验收为 100 个包单元测试、3 个脚本检查、10 个 E2E。本次文档提交时，10E/10F 远端验收：**待验收**；以 [Task 10 PR](https://github.com/Dream-Fsh/Web-Agent-MVP/pull/3) 最新 head 对应的完整 CI 为准，Task 09 的成功记录不能替代。独立 review：**待审查**，CI 与自检不替代独立审查。

Next：经单独授权的 Real-site Read-only Pilot，目前尚未启动。准备清单见 [只读试点](docs/pilot-readonly.md)。

## Quick Start

在仓库根目录执行。需要 Node.js 24+；`npm install` 可用于开发，固定依赖安装使用 `npm ci`。

```powershell
npm ci
npx playwright install chromium chrome
npm run verify
npm exec -- web-agent --help
```

启动下文 Fixture，保留它打印的地址，然后在另一终端执行（把示例端口替换为实际端口）：

```powershell
npm exec -- web-agent login --url http://127.0.0.1:4318/rta
npm exec -- web-agent record --url http://127.0.0.1:4318/rta
npm exec -- web-agent workflow list
npm exec -- web-agent run <id> --var accountId=10001
```

`login` 打开独立 `data/browser-profile/`，由用户手动登录后关闭浏览器；fixture 查询无需登录。`record` 自动加载已构建的 Extension 并启动保存服务，按下文 UI 步骤完成一次演示，关闭录制浏览器后再运行 Workflow。`<id>` 替换为实际生成的 Workflow ID，不是 JSON 文件路径。Fixture 终端在重放时必须保持运行。这里使用本地 workspace 的 `npm exec -- web-agent`，不要求全局安装。

## 开发命令

需要 Node.js 24+、npm、Chrome，以及 Playwright Chromium。

```powershell
npm ci
npx playwright install chromium chrome
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run verify
```

`test:e2e` 会先 build，再执行所有 E2E；`verify` 执行 typecheck、单元测试和 test:e2e。`npm ci` 的 postinstall 会按工作区依赖顺序 build，因此全新安装后可直接 typecheck；不要使用 `--ignore-scripts` 后直接跳过构建。CI 在 PR 和 push main 时执行全部命令，不跳过 Extension E2E。

## Extension 开发与加载

```powershell
npm run build -w @web-agent/extension
npm run verify:extension -w @web-agent/extension
```

打开 Chrome 的 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载 `apps/extension/dist`。更改代码后重新 build，在扩展管理页点刷新，再刷新目标网页。录制面板由扩展注入普通 HTTP/HTTPS 页面；Chrome 内部页面、商店及其他禁止注入的页面不支持。

## Fixture 运行

在仓库根目录运行以下命令，终端打印临时本地地址，打开该地址的 `/rta`。保持终端运行，Ctrl+C 停止。

```powershell
node --input-type=module -e 'import { startFixtureServer } from "@web-agent/fixture-site"; const s = await startFixtureServer(); console.log(s.baseUrl + "/rta"); process.on("SIGINT", () => s.close().then(() => process.exit(0)));'
```

Fixture 只包含业务查询、表格、分页等测试场景，没有录制控制按钮。

## Recorder 使用

1. 在仓库根目录执行 `npm exec -- web-agent record --url <URL>`，自动打开独立 Chromium、加载 Extension 并启动本地保存服务。终端打印实际服务地址及本次进程有效的配对码。仅手动加载扩展的开发方式使用 `npm run recorder`，其默认服务地址为 `http://127.0.0.1:4317`。
2. 打开目标网页，再打开扩展 popup，选择“目标页面”，填入本地服务地址和配对码，点击“连接保存服务”。配对码只进入扩展页面与内存，不进入网页面板或录制文件。
3. 在网页右上角面板点击“开始录制”。确认 `Recording: ON`，演示输入与查询；Events 随操作增长。
4. 输入变量名（例如 `accountId`），点击“标记变量”，再点击已输入的账户字段。敏感字段先勾选“敏感变量”；标记会清理已有录制中的对应值，后续输入也会脱敏。
5. 选择提取类型、填写输出键（例如 `results`），点击“标记提取”，再点击结果 table。
6. 选择断言类型，填写预期值（包含文本可填 `{{accountId}}`），点击“标记断言”，再点击结果区域。该断言始终 `required=true`。
7. 点击“停止录制”，等待面板显示“已保存”及 Workflow 文件路径。若提示“保存结果待确认”，检查本地目录；响应丢失不能证明保存失败，不要盲目重复保存。

目标必须有唯一、稳定的定位信息；无法唯一定位会显示错误。选定标签页通过 opener 打开的新标签可继承会话；顶层 UI 可标注有稳定标识的同源 iframe。重启保存服务后需重新配对。未连接时仍可在扩展 session 中缓冲脱敏录制，但不会自动产生磁盘 Workflow。CLI 只在 UI 真正开始后输出 Session，保存完成后输出 Workflow 路径。

## Record-to-Workflow 文件流程

```text
data/recordings/<sessionId>/
  metadata.json
  raw-events.ndjson
  annotations.json
  normalized-actions.json
  screenshots/             # 未配置安全截图处理时不保存原始截图
workflows/<workflowId>/
  v1.json
  current.json             # { "currentVersion": 1 }
```

停止后服务自动持久化脱敏 RawEvent 与 Annotation，读取校验后的文件，执行 Normalizer、Builder 和版本保存。变量原值替换成 `{{accountId}}`，无敏感默认值。保存使用 create-only 版本文件与原子 current 指针更新；版本单调递增，不静默覆盖。

异常恢复边界见 [Workflow persistence recovery](docs/workflow-persistence-recovery.md)。完整 UI 验收位于 [record-to-workflow.e2e.spec.ts](tests/record-to-workflow.e2e.spec.ts)，生成的原始数据、动作、Workflow、截图和三次 RunResult 保留在 `test-results/record-to-workflow.e2e-*/`，下次 E2E 会替换这些临时证据。

## CLI 执行、修复与恢复

```powershell
npm exec -- web-agent workflow inspect <id>
npm exec -- web-agent workflow history <id>
npm exec -- web-agent run <id> --var accountId=10001 --headless --json
npm exec -- web-agent failures list
npm exec -- web-agent repair <runId> --var accountId=10001 --headless
npm exec -- web-agent workflow rollback <id> 1
npm exec -- web-agent recording recover
```

`inspect` 输出当前版本、变量、步骤、断言与提取配置；`history` 列出保留的版本。`run` 调用 Generic Runner，输出每步结果和 outputs；只有 `RunResult.status === "success"` 才成功，required assertion 失败会让最终结果失败，CLI 退出码为 2。`--json` 输出完整 RunResult。结果与脱敏失败包保存在 `data/runs/` 和 `data/failures/`。

所有命令可用 `--root DIR` 指定同一个应用数据根目录；默认是当前目录。login、record、run 使用该根目录下的独立 `data/browser-profile/`，不能同时占用，也不复用日常 Chrome。不要将敏感变量值放入可分享的 shell 历史或日志；V1 CLI 尚无安全交互式秘密输入入口。

`repair` 读取真实失败包，经 Codex Adapter 请求 Patch，再做 schema / Safety validation 和 replay，PASS 后才创建新版本并更新 current。默认依赖本机已安装、已认证且可用的 Codex CLI。**仅允许 loopback 本地场景**；请求和重定向不能逃逸到真实站点。不绕过限制，首次真实站点修复仍需另行人工 review。CI 使用明确标注的模型子进程替身验证接线，实际 Codex 本地验证见 [10A 验收](docs/task10a-acceptance.md)。

`rollback` 只更新 current 指针，保留所有历史版本；下一次保存仍使用高于已有版本的编号。`recording recover` 在进程退出且 heartbeat 超时后归档 abandoned 锁并保留审计；active / recent 不会抢占。默认 heartbeat 每秒、超时 30 秒。恢复不续录，也不删除旧锁证据；缺失 owner 的旧式锁不能自动判断归属。详见 [10B 恢复](docs/task10b-recovery.md)。

## 验收证据

- [本轮 3 个 P1 阻塞项修复与回归证据](docs/p1-task10-fixes.md)：最终 SHA 待独立复审；两个 PR 均未合并。


- [10A CLI 接线与真实 Codex 本地验收](docs/task10a-acceptance.md)
- [10B 心跳与异常恢复](docs/task10b-recovery.md)
- [10C 同源 iframe / 新标签 UI E2E](docs/task10c-contexts.md)
- [10D 只读试点准备](docs/pilot-readonly.md)
- [CLI 真实进程 E2E](tests/cli-production.e2e.spec.ts)、[上下文 E2E](tests/multi-context.e2e.spec.ts)、[恢复 E2E](tests/recording-recovery.e2e.spec.ts)
- [CI 配置](.github/workflows/ci.yml) 在 PR / push main 时执行 npm ci、typecheck、test、build、test:e2e、verify，不跳过 Extension E2E。CI 工件 `extension-e2e-evidence` 保留 7 天；本地 `test-results/` 会被后续测试替换，临时 profile 不上传。

## Safety 限制

- 密码、hidden 输入、按名称识别的 token/cookie 字段，以及明确声明的敏感变量会脱敏；URL query 全部去除，查询条件应使用录制输入与变量表达。
- 录制期间只在扩展 session 内存中缓冲；停止后才保存脱敏副本。没有读取 cookie 的权限；原始截图默认不保存。
- 默认只读策略阻止 write、destructive 和无法明确归类的操作；跨源导航需已有 Safety allowlist。关键词分类不能识别所有站点语义，V1 不适合无人审核的真实后台操作。
- 无标签的任意秘密字符串无法保证自动识别；不要录制登录、粘贴凭据或密码管理器内容。普通站点 DOM 可影响录制目标，配对凭据仅在扩展自身 popup 输入。
- 独立 browser profile 会持久化认证 cookie 等登录态，即使关闭密码保存也应按敏感目录保管。已生成文件属于本地业务数据；profile、真实录制和凭据不得提交 Git 或上传 CI。

## V1 不支持与验证边界

- 未验证真实广告后台；不执行自动保存、预算修改、创建、发布、启停、删除、支付。
- 已验证普通页面、HTML table、有唯一稳定标识的同源 iframe、opener 关联新标签页。跨域 frame、动态 frame、无稳定标识 frame、任意已有标签页并入录制、跨页面导航恢复和动态复杂控件未验收。
- 虚拟表格不支持；OCR、Vision、Desktop automation 不在 V1 范围。
- 真实站点自动 Repair promote 不支持；当前 CLI repair 限制在 loopback。首次真实修复必须人工 review。
- 提供带审计的异常锁恢复，不承诺续录或所有文件系统的断电持久性；多上下文失败证据的完整覆盖尚未单独验收。
