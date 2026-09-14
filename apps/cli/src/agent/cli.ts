import { resolve } from 'node:path';
import { parseArguments } from '../arguments.js';
import type { CliOptions } from '../index.js';
import { registerSkill, enableSkill, disableSkill, listSkills, planTask, executePlan, cancelPlan, inspectAgentResult } from './index.js';
import { readJson } from './store.js';

export async function runAgentCli(args: string[], options: CliOptions): Promise<string> {
  let parsed: ReturnType<typeof parseArguments>;
  try { parsed = parseArguments(args); }
  catch { throw new Error('Invalid Agent arguments (values omitted for safety)'); }
  const [, command, value, extra] = parsed.positional;
  if (parsed.help) return 'agent skills | skills register FILE --confirm | skills enable ID --confirm | skills disable ID | plan TASK | execute ID --confirm | cancel ID | result ID';
  if (parsed.url || parsed.cdpPort || parsed.positional.length > 4) throw new Error('Unsupported Agent arguments');
  const root = resolve(parsed.root ?? options.root ?? process.cwd());
  const settings = { confirm: parsed.confirm, variables: parsed.variables, headless: parsed.headless, signal: options.signal };
  let result: unknown;
  try {
    if (command === 'skills' && !value) result = await listSkills(root);
    else if (command === 'skills' && value === 'register' && extra) result = await registerSkill(root, await readJson(resolve(extra), 8192), settings);
    else if (command === 'skills' && value === 'enable' && extra) result = await enableSkill(root, extra, parsed.confirm);
    else if (command === 'skills' && value === 'disable' && extra) result = await disableSkill(root, extra);
    else if (command === 'plan' && value && !extra && !parsed.confirm) result = await planTask(root, value, { ...settings, skillId: parsed.skill });
    else if (command === 'execute' && value && !extra && !parsed.skill && !Object.keys(parsed.variables).length) result = await executePlan(root, value, settings);
    else if (command === 'cancel' && value && !extra) result = await cancelPlan(root, value);
    else if (command === 'result' && value && !extra) result = await inspectAgentResult(root, value);
    else throw new Error('Invalid Agent command');
  } catch (error) {
    options.onExitCode?.(2);
    // Never print filesystem/JSON/model errors, which can contain task or secret bytes.
    const message = error instanceof Error && /^(Confirmation required|Plan already used|Plan expired|Planner failed|Planner cancelled|Skill disabled|Invalid non-sensitive parameter|Required parameter missing|Local replay validation failed|Unknown or disabled selected skill)/.test(error.message)
      ? error.message : 'Agent validation failed; no new execution authorized. Check local skill/plan/version and re-plan.';
    return JSON.stringify({ status: options.signal?.aborted ? 'cancelled' : 'failed', message });
  }
  const status = (result as { status?: string })?.status;
  if (status && !['ready', 'success'].includes(status)) options.onExitCode?.(2);
  return JSON.stringify(result, null, 2);
}
