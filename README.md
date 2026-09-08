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

RawEvent 与 RecordingAnnotation 独立保存。UI 不构造 Workflow Step；Builder 不依赖 Extension 或 Codex。Codex Adapter 仅属于验证后的 Repair Patch 流程基础，不参与普通录制、生成或执行。

## 已完成功能与项目状态

Completed：Protocol、Fixture、Safety / Redaction、Recorder Core、Recording Adapter、Normalizer、Locator Engine、Generic Runner、Assertions、Extraction、Failure Package、Repair Patch foundation、Integration Hardening。

Current：User-visible Record-to-Workflow。09A–09E 已通过本地验收：77 个包单元测试、2 个构建脚本测试、4 个 Playwright E2E；包括真实加载 Extension、点击录制与标注、生成文件、替换账户变量重跑，以及 required assertion 失败分支。GitHub CI 配置见 [.github/workflows/ci.yml](.github/workflows/ci.yml)，最新运行结果见 [Actions](https://github.com/Dream-Fsh/Web-Agent-MVP/actions/workflows/ci.yml)。Task 09 验收要求本地与托管 CI 都通过。

Next：CLI Production Wiring，之后才是经授权的 Real-site Read-only Pilot。当前 CLI 仍是基础骨架，不能用 placeholder 命令作为真实执行证据。

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

1. 在仓库根目录执行 `npm run recorder`，保持本地保存服务运行。默认地址为 `http://127.0.0.1:4317`；终端显示仅本次进程有效的配对码。
2. 打开目标网页，再打开扩展 popup，选择“目标页面”，填入本地服务地址和配对码，点击“连接保存服务”。配对码只进入扩展页面与内存，不进入网页面板或录制文件。
3. 在网页右上角面板点击“开始录制”。确认 `Recording: ON`，演示输入与查询；Events 随操作增长。
4. 输入变量名（例如 `accountId`），点击“标记变量”，再点击已输入的账户字段。敏感字段先勾选“敏感变量”；标记会清理已有录制中的对应值，后续输入也会脱敏。
5. 选择提取类型、填写输出键（例如 `results`），点击“标记提取”，再点击结果 table。
6. 选择断言类型，填写预期值（包含文本可填 `{{accountId}}`），点击“标记断言”，再点击结果区域。该断言始终 `required=true`。
7. 点击“停止录制”，等待面板显示“已保存”及 Workflow 文件路径。若提示“保存结果待确认”，检查本地目录；响应丢失不能证明保存失败，不要盲目重复保存。

目标必须有唯一、稳定的定位信息；无法唯一定位会显示错误。一个保存服务连接对应选定标签页，重启保存服务后需重新配对。未连接时仍可采集并在扩展中保存脱敏录制，但不会自动产生磁盘 Workflow。

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

## Runner 使用

Task 10 之前通过包 API 执行真实生成的 Workflow。将下列代码保存为仓库根目录的临时 `.mjs`，将文件参数替换为面板显示的 `v1.json` 路径；对应网页服务需要仍可访问。

```js
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { parseWorkflow } from '@web-agent/protocol';
import { runWorkflow } from '@web-agent/runner';

const workflow = parseWorkflow(JSON.parse(await readFile(process.argv[2], 'utf8')));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await runWorkflow(page, workflow, { variables: { accountId: '10001' } });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
```

只有 `RunResult.status === "success"` 才表示成功。required assertions 失败决定最终失败；表格等提取结果写入 `RunResult.outputs`。此示例使用全新浏览器，不继承个人登录态。

## Safety 限制

- 密码、hidden 输入、按名称识别的 token/cookie 字段，以及明确声明的敏感变量会脱敏；URL query 全部去除，查询条件应使用录制输入与变量表达。
- 录制期间只在扩展 session 内存中缓冲；停止后才保存脱敏副本。没有读取 cookie 的权限；原始截图默认不保存。
- 默认只读策略阻止 write、destructive 和无法明确归类的操作；跨源导航需已有 Safety allowlist。关键词分类不能识别所有站点语义，V1 不适合无人审核的真实后台操作。
- 无标签的任意秘密字符串无法保证自动识别；不要录制登录、粘贴凭据或密码管理器内容。普通站点 DOM 可影响录制目标，配对凭据仅在扩展自身 popup 输入。
- 已生成文件属于本地业务数据，请自行控制目录访问，不要提交真实录制或凭据到 Git。

## V1 不支持与验证边界

- 未验证真实广告后台；不执行自动保存、预算修改、创建、发布、启停、删除、支付。
- 当前可见录制闭环验证覆盖普通页面、稳定唯一目标与 HTML table；跨 frame、多标签、跨页面导航恢复、动态复杂控件不作为已完成的录制闭环能力。Builder 保留 frame context，但 Runner 尚无完整 frame 重放接线。
- 虚拟表格不支持；OCR、Vision、Desktop automation 不在 V1 范围。
- 没有 production CLI login/record/run/repair 接线，也没有真实站点自动 Repair promote。首次真实修复必须人工 review。
- 强制终止写入进程可能遗留锁或未发布版本，需要人工恢复；不承诺所有文件系统的断电持久性。
