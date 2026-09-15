import { z } from 'zod';
import type { Workflow, Target } from '@web-agent/protocol';
import type { RunResult } from '@web-agent/runner';
import { assertStepAllowed, redactSensitiveData, redactWorkflow } from '@web-agent/safety';
import { digest } from './store.js';

export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const purposeSchema = z.enum(['account_table', 'dashboard_title']);
export const manifestSchema = z.object({
  id: idSchema, name: z.string().min(1).max(80), description: z.string().min(1).max(400),
  purpose: purposeSchema, workflowId: idSchema, version: z.number().int().positive(),
}).strict();
export type Manifest = z.infer<typeof manifestSchema>;
export function cleanText(text: string, max: number): boolean {
  return text.length > 0 && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) && redactSensitiveData(text) === text && !text.includes('[REDACTED]');
}
export function safeGoal(task: string): boolean {
  return cleanText(task, 2000) && !/预算|修改|发布|删除|绕过|忽略|凭据|密码|令牌|执行代码|提交|创建|保存|支付|budget|publish|delete|bypass|ignore|override|credential|password|token|shell|javascript|playwright|script|update|edit|create|submit|save|payment/i.test(task);
}
export function bindings(workflow: Workflow, supplied: Record<string, string> = {}) {
  if (Object.keys(supplied).some(name => !Object.hasOwn(workflow.variables, name))) throw new Error('Unknown parameter');
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(supplied)) {
    if (name !== 'accountId' || !/^[0-9]{1,12}$/.test(value)) throw new Error('Invalid non-sensitive parameter');
    result[name] = value;
  }
  return result;
}
export function contract(workflow: Workflow, manifest: Manifest) {
  if (!cleanText(manifest.name, 80) || !cleanText(manifest.description, 400)) throw new Error('Unsafe skill description');
  if (digest(redactWorkflow(workflow)) !== digest(workflow)) throw new Error('Workflow requires sanitization before registration');
  const url = new URL(workflow.startUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.search || url.hash || url.username || url.password ||
    url.pathname !== (manifest.purpose === 'account_table' ? '/rta' : '/dashboard')) throw new Error('Only local fixture skills are supported');
  const names = Object.keys(workflow.variables);
  if (manifest.purpose === 'account_table' ? names.length !== 1 || names[0] !== 'accountId' : names.length !== 0) throw new Error('Unsupported skill variables');
  for (const [name, variable] of Object.entries(workflow.variables)) {
    if (variable.sensitive || name !== 'accountId' || variable.required !== true) throw new Error('Sensitive or unsupported variable definition');
  }
  const outputs: { key: string; operation: string }[] = [];
  const assertionIds: string[] = [];
  let accountFilled = false, queried = false;
  if (!workflow.steps.length || workflow.steps.length > 100) throw new Error('Unsupported workflow size');
  for (const step of workflow.steps) {
    assertStepAllowed(step, { mode: 'read-only', allowedOrigins: [] }, workflow.startUrl);
    if (step.type === 'download') throw new Error('Downloads are outside this experiment');
    if (step.url && step.url !== workflow.startUrl) throw new Error('Workflow leaves registered fixture route');
    if (step.type === 'input' && step.parameters?.value !== '{{accountId}}') throw new Error('Inputs must use the declared parameter');
    if (manifest.purpose === 'account_table') {
      // This is deliberately the top-level local fixture contract, not general
      // business inference from names/descriptions or a model's explanation.
      const frame = step.parameters?.frame as { frameId?: number; framePath?: unknown[] } | undefined;
      if (frame && (frame.frameId !== 0 || !Array.isArray(frame.framePath) || frame.framePath.length)) throw new Error('Account query requires the top-level fixture');
      if (step.type === 'navigate' || step.type === 'switchTab') { accountFilled = false; queried = false; }
      if (step.type === 'input') {
        if (!fixtureTarget(step.target, 'account')) throw new Error('Account parameter must target the query account input');
        accountFilled = true; queried = false;
      }
      if (step.type === 'click') {
        if (fixtureTarget(step.target, 'query')) { queried = accountFilled; }
        else if (!fixtureTarget(step.target, 'account')) { accountFilled = false; queried = false; }
      }
      if (step.type === 'select') { accountFilled = false; queried = false; }
      if (step.type === 'extract' && (!queried || !fixtureTarget(step.target, 'table'))) throw new Error('Account query parameter is not consumed before result extraction');
    }
    if (step.type === 'extract') {
      const { key, operation } = step.parameters ?? {};
      if (typeof key !== 'string' || !idSchema.safeParse(key).success || !cleanText(key, 128) ||
        operation !== (manifest.purpose === 'account_table' ? 'extractTable' : 'extractText')) throw new Error('Skill output does not match workflow');
      if (outputs.some(output => output.key === key)) throw new Error('Duplicate output');
      outputs.push({ key, operation: String(operation) });
    }
    if (step.type === 'assert') {
      const list = step.parameters?.assertions;
      if (!Array.isArray(list)) throw new Error('Invalid success conditions');
      for (const assertion of list) {
        if (!assertion || typeof assertion.id !== 'string') throw new Error('Invalid success conditions');
        if (assertion.required !== false) assertionIds.push(step.id + '/' + assertion.id);
      }
    }
  }
  if (!outputs.length || !assertionIds.length) throw new Error('Extraction and required assertions are mandatory for skills');
  return { contractVersion: 2 as const, variables: Object.fromEntries(names.map(name => [name, { type: 'string', format: 'numeric-id', required: true, sensitive: false }])),
    outputs, assertionIds, scope: { startUrl: workflow.startUrl, origin: url.origin, mode: 'read-only' as const, allowedOrigins: [] as string[], localOnly: true as const } };
}
export type Contract = ReturnType<typeof contract>;
function fixtureTarget(target: Target | undefined, kind: 'account' | 'query' | 'table'): boolean {
  return Boolean(target?.locators.some(locator => {
    const value = locator.value.replace(/'/g, '"');
    if (kind === 'account') return (locator.strategy === 'css' && /^(?:input)?\[name="?accountId"?\]$/.test(value)) || (locator.strategy === 'attribute' && value === 'name=accountId') || (locator.strategy === 'label' && value === '账户ID');
    if (kind === 'table') return locator.strategy === 'css' && value === 'table';
    return (locator.strategy === 'css' && value === 'button' && target.fingerprint.text === '查询') || (locator.strategy === 'text' && value === '查询') || (locator.strategy === 'role' && value === '查询' && target.fingerprint.role === 'button');
  }));
}
export function accountIdentityMatches(result: RunResult, spec: Contract, variables: Record<string, string>): boolean {
  if (!Object.hasOwn(spec.variables, 'accountId')) return true;
  const id = variables.accountId;
  if (!id || !/^[0-9]{1,12}$/.test(id)) return false;
  return spec.outputs.every(({key}) => {
    const table = result.outputs[key] as {headers?: unknown; rows?: unknown} | undefined;
    if (!table || JSON.stringify(table.headers) !== JSON.stringify(['策略ID','策略名称','状态']) || !Array.isArray(table.rows) || !table.rows.length) return false;
    return table.rows.every(row => Array.isArray(row) && row.length === 3 && typeof row[0] === 'string' && /^RTA\d{3}$/.test(row[0]) && row[1] === `账户 ${id} 策略 ${row[0].slice(3)}`);
  });
}
export function successful(result: RunResult, spec: Contract, variables: Record<string, string> = {}): boolean {
  if (result.status !== 'success') return false;
  if (!accountIdentityMatches(result, spec, variables)) return false;
  return spec.outputs.every(output => Object.hasOwn(result.outputs, output.key)) &&
    spec.assertionIds.every(pair => {
      const slash = pair.indexOf('/'), stepId = pair.slice(0, slash), assertionId = pair.slice(slash + 1);
      const output = result.outputs[stepId] as { success?: boolean; results?: { id: string; required: boolean; status: string }[] } | undefined;
      return result.steps.some(step => step.id === stepId && step.status === 'completed') && output?.success === true &&
        output.results?.some(row => row.id === assertionId && row.required && row.status === 'passed');
    });
}
