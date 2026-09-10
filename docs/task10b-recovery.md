# Task 10B — Recording Session Recovery

## 用法

```sh
npm exec -- web-agent recording recover
```

`--root DIR` 与其他 CLI 命令一致。默认心跳每秒更新，超时阈值 30 秒。恢复同时检查录制服务、自动化 profile 和每个 Workflow 写入锁。

- `active`：所属进程仍存活，不回收。
- `recent`：进程已退出，但心跳尚未超时，不回收。
- `abandoned`：归档旧锁，保留 owner 和恢复日志，允许新会话。
- `already-recovered`：并发恢复中另一调用已经完成归档。
- `absent`：没有该锁。

## 锁与审计

锁是包含 `owner.json` 的目录，记录随机 owner ID、PID、开始时间、心跳时间、超时阈值及可选真实 Extension sessionId。能力配对码、密码、cookie 和录制内容不会写进锁记录。

新锁先在暂存目录写好 owner，再以非空目录排他发布。回收要求同时满足“超时”和“进程已退出”。超时本身不会抢占仍活着的进程。

恢复先在 `<lock>.audit/<owner>.abandoned.json` 记录意图，再把锁归档到 `<lock>.history/<owner>.abandoned/`。其中 `recovery.json` 链接到已落盘的审计记录。恢复中断也保留审计；并发恢复不会覆盖其他 owner 的锁或历史。正常结束归档为 `.closed`。不直接删除遗留锁。

目录：

- `data/recording.lock`：Recording Service 生命周期。
- `data/browser-profile.lock`：打开 profile 前获取；关闭浏览器后归档。
- `workflows/<id>/.writer.lock`：版本保存和回滚期间持有。

## 验证范围

- 心跳更新、独占、活跃进程保护、未超时保护、过期归档。
- 并发恢复和旧 owner 无法更新新锁。
- 归档失败前已有恢复审计。
- Workflow 发布期间持有带 owner 的写锁。
- 被占用的 profile 不会被读写偏好或再次打开。
- 真实子进程强杀后的 CLI 恢复：等待真实心跳、拒绝回收活跃进程、SIGKILL、超时归档、新服务启动。
- 真实 CLI 强杀后浏览器断开验证，使用临时独立配置。
- 原有真实 Extension 录制、CLI run / repair / rollback 保持 E2E 验证。

## 边界

恢复不会自动续录、不重放半成品、不删除录制证据，也不执行真实广告后台操作。PID 重用时保守地视为 active。旧版本无 owner 元数据的裸锁文件会被拒绝自动回收，需先核实归属，不能猜测后强行删除。测试验证的是当前 Playwright 启动的自动化浏览器随 CLI 终止退出；不接管用户手动启动的 Chrome。

2026-09-10 验收：npm run build PASS；npm run verify PASS（typecheck、98 项单元测试、2 项构建测试、8 项 E2E）。已做限定代码审查并修复并发恢复完成者状态判断，git diff --check PASS。
