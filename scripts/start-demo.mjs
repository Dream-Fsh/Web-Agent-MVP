import { spawn } from 'node:child_process';
import { startFixtureServer } from '@web-agent/fixture-site';
import { recoverRecordings } from '@web-agent/recording-service';

// Only exited owners with expired heartbeats can be recovered by this API.
const recovered = await recoverRecordings(process.cwd());
const occupied = recovered.filter(item => item.status === 'active' || item.status === 'recent');
if (occupied.length) {
  console.error('录制服务或浏览器仍被占用，或刚刚退出。请关闭旧录制浏览器，退出旧终端任务后等待 30 秒再启动。');
  process.exit(1);
}
if (recovered.some(item => item.status === 'abandoned')) console.log('已归档上次异常退出留下的锁，继续启动。');
const fixture = await startFixtureServer();
const url = `${fixture.baseUrl}/rta`;
let finalized = false;
let requestedExitCode;

function finish(code) {
  if (finalized) return;
  finalized = true;
  void fixture.close()
    .catch(error => console.error(`Failed to stop Fixture: ${error.message}`))
    .finally(() => process.exit(code));
}

function requestStop(child, code) {
  requestedExitCode ??= code;
  if (child.exitCode !== null || child.killed) return;
  child.kill('SIGINT');
}

console.log(`\nWeb Agent demo is ready: ${url}`);
console.log('即将打开录制浏览器并自动连接保存服务。');
console.log('点击“开始录制”后正常操作网页，点击“停止录制”保存。无需标记变量、提取或断言。关闭浏览器会停止本地演示服务。\n');

const child = spawn(process.execPath, ['apps/cli/dist/bin.js', 'record', '--url', url], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: false,
});

child.once('error', error => {
  console.error(`Unable to start the recorder: ${error.message}`);
  finish(1);
});
child.once('close', code => finish(requestedExitCode ?? code ?? 1));
process.once('SIGINT', () => requestStop(child, 130));
process.once('SIGTERM', () => requestStop(child, 143));
