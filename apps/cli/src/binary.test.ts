import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
it('exposes a real executable with help and a nonzero exit for invalid arguments',()=>{
  const binary = fileURLToPath(new URL('../dist/bin.js',import.meta.url));
  const help = spawnSync(process.execPath,[binary,'--help'],{encoding:'utf8'});
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('web-agent record');
  const invalid = spawnSync(process.execPath,[binary,'run','x','--unknown'],{encoding:'utf8'});
  expect(invalid.status).toBe(1); expect(invalid.stderr).toContain('Unknown option');
});
