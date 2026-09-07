import { startRecordingService } from './index.js';
const service = await startRecordingService({ root: process.cwd(), port: 4317 });
console.log(`本地录制保存服务：${service.baseUrl}\n本次配对码（仅本次进程有效）：${service.capability}\n请在 Extension 弹窗中选择目标页面并连接保存服务。Ctrl+C 停止。`);
process.on('SIGINT', () => { void service.close().then(() => process.exit(0)); });
