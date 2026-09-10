import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('pilot checklist keeps manual authorization, isolated identity and failure evidence gates', async () => {
  const text = await readFile(new URL('../docs/pilot-readonly.md', import.meta.url), 'utf8');
  for (const required of ['尚未启动', 'data/browser-profile/', '人工授权', '查询', '搜索', '打开详情', '翻页', '提取', '下载', '修改预算', '创建', '发布', '启停', '删除', '支付', 'Failure Package', '人工 review', '不得自动 promote']) assert.ok(text.includes(required), `Missing pilot gate: ${required}`);
  for (const [, target] of text.matchAll(/\]\(([^)]+\.md)\)/g)) await readFile(new URL(`../docs/${target}`, import.meta.url));
});
