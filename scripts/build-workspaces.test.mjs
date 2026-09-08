import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as build from './build-workspaces.mjs';

test('builds workspace dependencies before consumers, including dev dependencies', () => {
  assert.equal(typeof build.orderWorkspaces, 'function');
  const packages = [
    { name: 'app', dependencies: { core: '*' }, devDependencies: { fixture: '*' } },
    { name: 'core', dependencies: { protocol: '*', external: '1' } },
    { name: 'fixture' }, { name: 'protocol' },
  ];
  const names = build.orderWorkspaces(packages).map(item => item.name);
  assert.ok(names.indexOf('protocol') < names.indexOf('core'));
  assert.ok(names.indexOf('core') < names.indexOf('app'));
  assert.ok(names.indexOf('fixture') < names.indexOf('app'));
  assert.equal(new Set(names).size, packages.length);
});

test('rejects dependency cycles before starting a build', () => {
  assert.equal(typeof build.orderWorkspaces, 'function');
  assert.throws(() => build.orderWorkspaces([{ name: 'a', dependencies: { b: '*' } }, { name: 'b', dependencies: { a: '*' } }]), /cycle/i);
});
