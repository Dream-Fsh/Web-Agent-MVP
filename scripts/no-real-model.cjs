// Test-only preload. CI must never fall back to an installed real Codex CLI.
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']) {
  const original = childProcess[method];
  childProcess[method] = function (command, args, ...rest) {
    const values = [command, ...(Array.isArray(args) ? args : [])].map(String);
    if (values.some(value => /(?:^|[\\/])codex(?:\.exe|\.cmd|\.ps1|\.js)?(?:\s|$)/i.test(value) || /@openai[\\/]codex[\\/]/i.test(value))) {
      throw new Error('TEST_ONLY_REAL_MODEL_FORBIDDEN: provide an explicit model double');
    }
    return original.call(this, command, args, ...rest);
  };
}
syncBuiltinESMExports();
