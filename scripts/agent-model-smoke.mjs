import { planningInstruction, requestTaskPlan } from '@web-agent/codex-adapter/planner';

const input = {
  task: '查询账户 20002 的数据，并提取结果表格',
  suppliedParameters: {},
  selectedSkillId: null,
  skills: [
    { id: 'fixture-query', name: '账户查询', description: '查询本地测试账户并提取结果表格', purpose: 'account_table', version: 1,
      variables: { accountId: { type: 'string', format: 'numeric-id', required: true, sensitive: false } },
      outputs: [{ key: 'results', operation: 'extractTable' }] },
    { id: 'fixture-title', name: '后台标题', description: '读取本地测试后台的页面标题', purpose: 'dashboard_title', version: 1,
      variables: {}, outputs: [{ key: 'title', operation: 'extractText' }] },
  ],
};
console.log('Synthetic model smoke input (no browser, credentials, DOM, recording or real business data):');
console.log(planningInstruction + JSON.stringify(input));
if (!process.argv.includes('--confirm')) {
  console.log('Preview only. After reviewing this exact synthetic input, run npm run agent:smoke -- --confirm to authorize ONE real Codex planning request (60s limit).');
} else {
  if (process.env.WEB_AGENT_PLANNER_TEST_COMMAND || process.env.WEB_AGENT_PLANNER_TEST_MODE) throw new Error('Real smoke refuses test provider configuration');
  try {
    const result = await requestTaskPlan(input);
    const passed = result.status === 'ready' && result.skillId === 'fixture-query' && result.version === 1 &&
      result.parameters.length === 1 && result.parameters[0].name === 'accountId' && result.parameters[0].value === '20002';
    console.log(JSON.stringify({ modelKind: 'codex', planningPassed: passed, browserExecuted: false, result }, null, 2));
    if (!passed) process.exitCode = 2;
  } catch (error) {
    const known = ['Planner authentication failed', 'Planner configuration rejected', 'Planner subprocess failed', 'Planner unavailable', 'Planner timed out', 'Planner response failed schema validation'];
    console.error((known.includes(error?.message) ? error.message : 'Real model smoke failed') + '. No fallback, no browser execution, no raw model diagnostics saved.');
    process.exitCode = 2;
  }
}
