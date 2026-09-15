import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArguments } from '../apps/cli/dist/arguments.js';

test('README CLI examples parse and local acceptance links resolve', async () => {
  const text = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const commands = [...text.matchAll(/^npm exec -- web-agent (.+)$/gm)].map(match => match[1].trim());
  assert.ok(commands.length >= 10, 'Document the production CLI command surface');
  for (const command of commands) assert.doesNotThrow(() => parseArguments(command.split(/\s+/)));
  for (const [, target] of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (!/^https?:/.test(target)) await readFile(new URL(`../${target}`, import.meta.url));
  }
  assert.doesNotMatch(text, /CLI 仍是基础骨架|没有 production CLI|Runner 尚无完整 frame/);
});
