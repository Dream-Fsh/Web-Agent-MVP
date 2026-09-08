import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

export function orderWorkspaces(packages) {
  const byName = new Map(packages.map(item => [item.name, item]));
  const visiting = new Set();
  const complete = new Set();
  const ordered = [];
  function visit(item) {
    if (complete.has(item.name)) return;
    if (visiting.has(item.name)) throw new Error(`Workspace dependency cycle: ${item.name}`);
    visiting.add(item.name);
    for (const dependency of Object.keys({ ...item.dependencies, ...item.devDependencies })) {
      if (byName.has(dependency)) visit(byName.get(dependency));
    }
    visiting.delete(item.name);
    complete.add(item.name);
    ordered.push(item);
  }
  for (const item of packages) visit(item);
  return ordered;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const packages = [];
  for (const group of ['apps', 'packages']) {
    for (const entry of await readdir(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      packages.push(JSON.parse(await readFile(join(root, group, entry.name, 'package.json'), 'utf8')));
    }
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this script through npm run build');
  for (const item of orderWorkspaces(packages)) {
    if (!item.scripts?.build) continue;
    const result = spawnSync(process.execPath, [npm, 'run', 'build', '--workspace', item.name], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
