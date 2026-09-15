# Task 10C — Multi Context Verification

## 已验证

`tests/multi-context.e2e.spec.ts` 使用已构建 Chrome Extension 的真实 popup / overlay 控件，未直接调用录制 API 或构造最终 Workflow。

1. 同源 iframe：页面输入 10001 → 查询 → 顶层 Extension UI 标记变量 / 表格 extraction / required assertion → 停止 → 服务自动生成 v1 → parseWorkflow → 新浏览器用 20002 重放 → frame 内查询、断言和输出成功。
2. 新标签页：A 页面点击原生链接 → B 继承录制会话 → B 输入、查询和标注 → 自动产生 switchTab → 新浏览器重放成功。重放上下文预先放入一个无关空白页，证明生成的 Workflow 不依赖浏览器的绝对标签序号。

## 修改范围

- Extension content scripts 在 frame 中采集，通过现有 runtime message passing 与后台 recorder-core 通信。只有顶层页面显示 overlay；标注模式广播到相关 frame。
- 同源 frame 通过唯一 id / name / title 生成 framePath；后台填充 Chrome frameId。标注关联同 frame 的动作。
- 后台依据 opener 关联录制会话；事件附带 tabId 与会话内 index。Page B 可见 UI 继续控制同一会话。
- Builder 保留动作及标注的 frame context；原生链接补隐式 link 角色；生成的 switchTab 使用 recording scope。
- Runner 进入唯一 frame 后调用原有执行器、Locator、Assertions 和 Extraction。相关模块只扩宽 Page / Frame 参数类型，未改定位算法或协议。
- recording scope 的标签序号只包括本次起始页和随后创建的页面；旧 Workflow 未指定 scope 时保留原绝对序号行为。

## TDD 证据

先后复现：缺少 fixture、iframe 标注数始终为 0、B 页面 Recording OFF、原生链接缺少稳定 locator、已有标签页导致重放切错页。逐项最小修正后两个真实 UI E2E PASS。额外验证 framePath 缺失及歧义时不会回退到顶层页面。

## 边界

本阶段保证的是有唯一 frame 标识的同源 frame，以及通过 opener 关联的新标签页。跨域 frame、无稳定标识 frame、任意既存标签页并入录制和 frame 动态移除/重建仍未验收。跨域或无路径 frame 不应被描述为已支持。未访问任何真实广告后台。

全量验证：npm run build、npm run typecheck、npm run verify 均 PASS；100 个单元测试、2 个构建测试、10 个 E2E。git diff --check PASS。已完成本地 diff 自检；独立 reviewer 因额度不足未完成，不计为审查通过。
