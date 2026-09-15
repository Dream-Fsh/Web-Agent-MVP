import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseWorkflow, type Workflow } from '@web-agent/protocol';
import { executeStoredRun } from '@web-agent/runner/production';
import { redactSensitiveData } from '@web-agent/safety';
import { requestTaskPlan, taskDecisionSchema, safePlannerError } from '@web-agent/codex-adapter/planner';
import { contract, bindings, manifestSchema, safeGoal, successful, accountIdentityMatches, fixtureTargetValidator, type Manifest, type Contract } from './contracts.js';
import { digest, identifier, locked, publish, readSealed, exists, ids, readJson } from './store.js';

type Skill = Manifest & Contract & { workflowHash: string; validation: { runId: string; at: string; workflowHash: string } };
export interface Provider { kind: 'codex' | 'test-double'; request: (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown> }
interface Options { confirm?: boolean; variables?: Record<string, string>; signal?: AbortSignal; headless?: boolean; now?: () => number }
export interface Plan extends Contract {
  id: string; skillId: string; skillHash: string; workflowId: string; version: number; workflowHash: string;
  bindings: Record<string, string>; modelKind: Provider['kind']; createdAt: number; expiresAt: number;
  taskDigest: string;
}
// Human-readable variables are bound values in the displayed plan; definitions remain in skill metadata.
type DisplayPlan = Omit<Plan, 'variables'> & { variables: Record<string, string>; variableDefinitions: Contract['variables'] };
async function frozen(root: string, workflowId: string, version: number) {
  identifier(workflowId);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid version');
  const path = join(root, 'workflows', workflowId, 'v' + version + '.json');
  const input = await readJson(path);
  const workflow = parseWorkflow(input);
  if (workflow.id !== workflowId || workflow.version !== version) throw new Error('Workflow identity mismatch');
  const bytes = await readFile(path);
  // Check a second read against the parsed value to fail closed on concurrent replacement.
  if (digest(JSON.parse(bytes.toString())) !== digest(input)) throw new Error('Workflow changed while loading');
  return { workflow, hash: createHash('sha256').update(bytes).digest('hex') };
}
async function skillAt(root: string, id: string, enabled = true) {
  const skill = await readSealed<Skill>(root, 'skills', id);
  if (skill.id !== id || !manifestSchema.safeParse({ id: skill.id, name: skill.name, description: skill.description, purpose: skill.purpose, workflowId: skill.workflowId, version: skill.version }).success) throw new Error('Invalid skill');
  if (enabled) {
    if (await exists(root, 'disabled', id)) throw new Error('Skill disabled; re-plan');
    const activation = await readSealed<{ skillHash: string }>(root, 'enabled', id);
    if (activation.skillHash !== digest(skill)) throw new Error('Skill activation changed');
  }
  const content = await frozen(root, skill.workflowId, skill.version);
  const spec = contract(content.workflow, skill);
  if (content.hash !== skill.workflowHash || skill.validation.workflowHash !== content.hash ||
    digest(spec) !== digest({ contractVersion: skill.contractVersion, variables: skill.variables, outputs: skill.outputs, assertionIds: skill.assertionIds, scope: skill.scope })) throw new Error('Skill workflow or scope changed; register and confirm again');
  return { skill, workflow: content.workflow };
}
export async function registerSkill(root: string, input: unknown, options: Options = {}) {
  if (!options.confirm) throw new Error('Confirmation required for local replay validation');
  options.signal?.throwIfAborted();
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid skill manifest');
  return locked(root, async () => {
    const manifest = parsed.data;
    if (await exists(root, 'skills', manifest.id)) throw new Error('Skill already registered; use a new ID');
    const content = await frozen(root, manifest.workflowId, manifest.version);
    const spec = contract(content.workflow, manifest);
    const variables = bindings(content.workflow, options.variables);
    if (Object.keys(spec.variables).some(name => !Object.hasOwn(variables, name))) throw new Error('Required parameter missing for validation');
    const result = await executeStoredRun(content.workflow, { root, variables, localOnly: true, headless: options.headless, signal: options.signal, validateTarget:fixtureTargetValidator(manifest.purpose) });
    if (!successful(result, spec, variables)) throw new Error('Local replay validation failed; inspect data/runs and data/failures');
    if ((await frozen(root, manifest.workflowId, manifest.version)).hash !== content.hash) throw new Error('Workflow changed during validation');
    const skill: Skill = { ...manifest, ...spec, workflowHash: content.hash, validation: { runId: result.runId, at: new Date().toISOString(), workflowHash: content.hash } };
    await publish(root, 'skills', manifest.id, skill);
    return { ...skill, enabled: false };
  });
}
export async function enableSkill(root: string, id: string, confirm: boolean) {
  if (!confirm) throw new Error('Confirmation required to enable skill');
  return locked(root, async () => {
    const { skill } = await skillAt(root, id, false);
    if (await exists(root, 'disabled', id)) throw new Error('Disabled skill requires a new registration ID');
    await publish(root, 'enabled', id, { skillHash: digest(skill), at: new Date().toISOString() });
    return { id, enabled: true };
  });
}
export async function disableSkill(root: string, id: string) {
  return locked(root, async () => {
    await readSealed(root, 'skills', id);
    if (!await exists(root, 'disabled', id)) await publish(root, 'disabled', id, { disabled: true });
    return { id, enabled: false };
  });
}
export async function listSkills(root: string) {
  return locked(root, async () => {
    const result: (Skill & { enabled: boolean })[] = [];
    for (const id of await ids(root, 'skills')) {
      const { skill } = await skillAt(root, id, false);
      const enabled = await exists(root, 'enabled', id) && !await exists(root, 'disabled', id);
      if (enabled) await skillAt(root, id);
      result.push({ ...skill, enabled });
    }
    return result;
  });
}
export function productionProvider(): Provider {
  const configured = process.env.WEB_AGENT_PLANNER_TEST_COMMAND;
  if (configured) {
    if (process.env.WEB_AGENT_PLANNER_TEST_MODE !== '1') throw new Error('Explicit planner test mode required');
    let command: string[];
    try { command = JSON.parse(configured); } catch { throw new Error('Invalid test provider configuration'); }
    if (!Array.isArray(command) || !command.length || !command.every(s => typeof s === 'string' && s.length > 0)) throw new Error('Invalid test provider configuration');
    return { kind: 'test-double', request: (input, options) => requestTaskPlan(input, { command, signal: options?.signal }) };
  }
  if (process.env.WEB_AGENT_PLANNER_TEST_MODE === '1') throw new Error('Explicit planner test command required; no real fallback');
  return { kind: 'codex', request: (input, options) => requestTaskPlan(input, { signal: options?.signal }) };
}
export async function planTask(root: string, task: string, options: Options & { provider?: Provider; skillId?: string } = {}) {
  options.signal?.throwIfAborted();
  if (!safeGoal(task)) return { status: 'refused', message: '不支持危险操作、敏感内容、代码指令或超长任务。' };
  const candidates = (await listSkills(root)).filter(skill => skill.enabled);
  if (options.skillId && !candidates.some(s => s.id === options.skillId)) throw new Error('Unknown or disabled selected skill');
  if (!candidates.length) return { status: 'no_match', message: '没有已验证且启用的技能；普通录制日志不能执行。' };
  if (candidates.length > 20) throw new Error('Skill catalog exceeds planning limit');
  const variables = options.variables ?? {};
  for (const [name, value] of Object.entries(variables)) if (name !== 'accountId' || !/^[0-9]{1,12}$/.test(value)) throw new Error('Invalid supplied parameter');
  const provider = options.provider ?? productionProvider();
  const publicSkills = candidates.map(s => ({ id: s.id, name: s.name, description: s.description, purpose: s.purpose, version: s.version, variables: s.variables, outputs: s.outputs }));
  let response: unknown;
  const planningStarted = Date.now();
  try { response = await provider.request({ task, suppliedParameters: variables, selectedSkillId: options.skillId ?? null, skills: publicSkills }, { signal: options.signal }); }
  catch (error) { throw safePlannerError(error, Date.now() - planningStarted, options.signal?.aborted); }
  options.signal?.throwIfAborted();
  const parsed = taskDecisionSchema.safeParse(response);
  if (!parsed.success || digest(redactSensitiveData(response)) !== digest(response)) throw new Error('Planner schema rejected');
  const decision = parsed.data;
  if (new Set(decision.candidates).size !== decision.candidates.length) throw new Error('Duplicate planner candidate');
  if (decision.candidates.some(id => !candidates.some(skill => skill.id === id))) throw new Error('Unknown planner candidate');
  if (decision.status === 'refused' || decision.status === 'no_match') {
    if (decision.parameters.length || decision.skillId !== null || decision.version !== null) throw new Error('Inconsistent planner decision');
    return { status: decision.status, modelKind: provider.kind, message: decision.status === 'refused' ? '任务不在授权范围内。' : '没有匹配技能；不会退化为自由浏览。' };
  }
  if (decision.status === 'needs_input' && decision.skillId === null && decision.candidates.length > 1 && !decision.parameters.length && decision.version === null) {
    return { status: 'needs_input', modelKind: provider.kind, candidates: [...decision.candidates].sort(), missingFields: [], message: '请选择一个技能或补充任务信息，然后重新规划。' };
  }
  const skill = candidates.find(s => s.id === decision.skillId);
  if (!skill || decision.version !== skill.version || decision.purpose !== skill.purpose || (options.skillId && skill.id !== options.skillId)) throw new Error('Planner skill/version rejected');
  if (!decision.candidates.includes(skill.id)) throw new Error('Planner candidate selection inconsistent');
  if (/表格|table/i.test(task) && !skill.outputs.some(output => output.operation === 'extractTable')) throw new Error('Task output requirement does not match selected skill');
  const plausible = candidates.filter(s => s.purpose === decision.purpose);
  if ((plausible.length > 1 && !options.skillId) || decision.candidates.length > 1) {
    return { status: 'needs_input', candidates: plausible.map(s => s.id).sort(), missingFields: [], message: '存在多个候选，请用 --skill 明确选择后重新规划。' };
  }
  const bound: Record<string, string> = {};
  for (const param of decision.parameters) {
    if (Object.hasOwn(bound, param.name)) throw new Error('Duplicate parameter');
    if (param.name !== 'accountId' || !/^[0-9]{1,12}$/.test(param.value) ||
      (variables[param.name] !== undefined ? variables[param.name] !== param.value : !new RegExp('(^|[^0-9])' + param.value + '([^0-9]|$)').test(task))) throw new Error('Invented or invalid parameter');
    bound[param.name] = param.value;
  }
  const current = await frozen(root, skill.workflowId, skill.version);
  bindings(current.workflow, bound);
  const missingFields = Object.keys(skill.variables).filter(name => !Object.hasOwn(bound, name));
  if (decision.missingFields.some(name => !Object.hasOwn(skill.variables, name))) throw new Error('Unknown missing parameter');
  if (missingFields.length || decision.status === 'needs_input') return { status: 'needs_input', missingFields, candidates: [skill.id], message: missingFields.length ? '请使用 --var 补充：' + missingFields.join(', ') : '请补充任务信息后重新规划。' };
  return locked(root, async () => {
    const latest = await skillAt(root, skill.id);
    const { enabled: _enabled, ...registered } = skill;
    if (digest(latest.skill) !== digest(registered)) throw new Error('Skill changed during planning');
    const now = (options.now ?? Date.now)();
    const plan: DisplayPlan = { id: crypto.randomUUID(), skillId: skill.id, skillHash: digest(latest.skill), workflowId: skill.workflowId, version: skill.version,
      workflowHash: skill.workflowHash, contractVersion: skill.contractVersion, variables: bound, variableDefinitions: skill.variables, bindings: bound, outputs: skill.outputs, assertionIds: skill.assertionIds, scope: skill.scope,
      createdAt: now, expiresAt: now + 15 * 60 * 1000, taskDigest: digest(task), modelKind: provider.kind };
    await publish(root, 'plans', plan.id, plan);
    return { status: 'ready', plan, message: '这是执行计划，不是任务结果；请检查后明确确认。' };
  });
}
export async function cancelPlan(root: string, id: string) {
  return locked(root, async () => { await readSealed(root, 'plans', id); await publish(root, 'used', id, { status: 'cancelled' }); return { status: 'cancelled', planId: id }; });
}
export async function executePlan(root: string, id: string, options: Options = {}) {
  if (!options.confirm) throw new Error('Confirmation required; no browser was opened');
  options.signal?.throwIfAborted();
  return locked(root, async () => {
    const plan = await readSealed<DisplayPlan>(root, 'plans', id);
    if (plan.id !== id || plan.expiresAt <= (options.now ?? Date.now)() || plan.createdAt > (options.now ?? Date.now)()) throw new Error('Plan expired; re-plan and confirm');
    if (await exists(root, 'used', id)) throw new Error('Plan already used or cancelled; no repeat execution');
    const { skill, workflow } = await skillAt(root, plan.skillId);
    if (digest(skill) !== plan.skillHash || skill.contractVersion !== plan.contractVersion || skill.workflowHash !== plan.workflowHash || skill.workflowId !== plan.workflowId || skill.version !== plan.version ||
      digest(skill.scope) !== digest(plan.scope) || digest(plan.bindings) !== digest(plan.variables) || digest(skill.outputs) !== digest(plan.outputs) ||
      digest(skill.assertionIds) !== digest(plan.assertionIds)) throw new Error('Plan scope/content changed; re-plan and confirm');
    const variables = bindings(workflow, plan.variables);
    if (Object.keys(skill.variables).some(name => !Object.hasOwn(variables, name))) throw new Error('Required parameter missing');
    options.signal?.throwIfAborted();
    // Create-only consumption is committed BEFORE browser operations; crash means no silent retry.
    await publish(root, 'used', id, { status: 'executing', at: Date.now() });
    try {
      const result = await executeStoredRun(workflow, { root, variables, localOnly: true, headless: options.headless, signal: options.signal, validateTarget:fixtureTargetValidator(skill.purpose) });
      const accountIdentity = accountIdentityMatches(result, skill, variables);
      const status = result.status === 'success' && !successful(result, skill, variables) ? 'failed' : result.status;
      const outcome = redactSensitiveData({ status, planId: id, modelKind: plan.modelKind, taskValidation: { accountIdentity: Object.hasOwn(skill.variables, 'accountId') ? (accountIdentity ? 'passed' : 'failed') : 'not_applicable' }, result, evidence: { run: 'data/runs/' + result.runId + '.json', failure: result.status === 'success' ? null : 'data/failures/' + result.runId } });
      await publish(root, 'results', id, outcome);
      return outcome;
    } catch {
      const outcome = { status: options.signal?.aborted ? 'cancelled' : 'failed', planId: id, message: '执行未完成；计划已消费，请检查证据，重新规划才能再次执行。' };
      await publish(root, 'results', id, outcome);
      return outcome;
    }
  });
}
export async function inspectAgentResult(root: string, id: string) { return locked(root, () => readSealed(root, 'results', id)); }
