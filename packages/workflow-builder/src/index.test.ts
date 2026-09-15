import { expect, it } from 'vitest';
import * as builder from './index.js';
import { normalizeEvents, type NormalizedAction } from '@web-agent/normalizer';
import { parseRawEvent, parseWorkflow, type RecordingAnnotation } from '@web-agent/protocol';

const raw = (id = 'input', value = '10001') => parseRawEvent({ schemaVersion: '1.0', id, sessionId: 's', timestamp: 1, type: 'input', url: 'https://fixture.test/rta', frame: { frameId: 0, framePath: [] }, value,
  element: { tag: 'input', label: '账户ID', attributes: { name: 'accountId' }, nearbyText: [], locatorCandidates: [] } });
const target = { fingerprint: { tag: 'table' }, locators: [{ strategy: 'css' as const, value: 'table', score: 1 }] };
const metadata = { id: 'query', name: '查询账户', sessionId: 's', startUrl: 'https://fixture.test/rta', createdAt: '2026-09-07T00:00:00.000Z' };
const variable = (sensitive = false): RecordingAnnotation => ({ id: 'v', sessionId: 's', type: 'variable', targetActionId: 'input', target, metadata: { originalValue: sensitive ? '[REDACTED]' : '10001', variableName: 'accountId', sensitive } });

it('builds and validates from normalized RawEvent and annotations without literal variable values', () => {
  expect(builder).toHaveProperty('buildWorkflow');
  const marks: RecordingAnnotation[] = [variable(),
    { id: 'extract', sessionId: 's', type: 'extraction', targetActionId: 'input', target, metadata: { operation: 'extractTable', key: 'results' } },
    { id: 'assert', sessionId: 's', type: 'requiredAssertion', targetActionId: 'input', target, metadata: { assertionType: 'assertVisible', expected: '', required: true } },
  ];
  const workflow = parseWorkflow(builder.buildWorkflow(normalizeEvents([raw()]), marks, metadata));
  expect(workflow.steps.map(step => step.type)).toEqual(['input', 'extract', 'assert']);
  expect(workflow.steps[0].parameters?.value).toBe('{{accountId}}');
  expect(workflow.variables.accountId).toEqual({ required: true, sensitive: false });
  expect(JSON.stringify(workflow)).not.toContain('10001');
  expect(workflow.steps[2].parameters?.assertions).toMatchObject([{ required: true, type: 'assertVisible' }]);
});
it('keeps secret variables required with no default and no persisted actual value', () => {
  expect(builder).toHaveProperty('buildWorkflow');
  const workflow = builder.buildWorkflow(normalizeEvents([raw('input', '[REDACTED]')]), [variable(true)], metadata);
  expect(workflow.variables.accountId).toEqual({ required: true, sensitive: true });
  expect(workflow.steps[0].parameters?.value).toBe('{{accountId}}');
});
it('maps all supported action kinds and preserves frame context, locators, and ordering', () => {
  expect(builder).toHaveProperty('buildWorkflow');
  const seed = normalizeEvents([raw()])[0];
  const actions = ['navigate', 'click', 'input', 'select', 'waitFor', 'switchTab', 'download'].map((type, index) => ({ ...seed, id: `a${index}`, type, sourceEventIds: [`raw${index}`], timestamp: index, context: { ...seed.context, frame: { frameId: 2, framePath: ['iframe[name="account"]'] } }, metadata: { index: 1 } })) as NormalizedAction[];
  const workflow = builder.buildWorkflow(actions, [], metadata);
  expect(workflow.steps.map(step => step.type)).toEqual(['navigate', 'click', 'input', 'select', 'waitFor', 'switchTab', 'download']);
  expect(new Set(workflow.steps.map(step => step.id)).size).toBe(7);
  expect(workflow.steps[1].parameters?.frame).toEqual(actions[1].context.frame);
  expect(workflow.steps[1].target?.locators).toContainEqual({ strategy: 'label', value: '账户ID', score: 1 });
});
it('resolves annotation references through merged input events', () => {
  expect(builder).toHaveProperty('buildWorkflow');
  const actions = normalizeEvents([raw('input', '1'), { ...raw('last'), timestamp: 2 }]);
  const workflow = builder.buildWorkflow(actions, [{ ...variable(), targetActionId: 'last' }], metadata);
  expect(workflow.steps[0].parameters?.value).toBe('{{accountId}}');
});
it('rejects dangling references, duplicate variables, and unsupported actions', () => {
  expect(builder).toHaveProperty('buildWorkflow');
  const actions = normalizeEvents([raw()]);
  expect(() => builder.buildWorkflow(actions, [{ ...variable(), targetActionId: 'missing' }], metadata)).toThrow(/reference/i);
  expect(() => builder.buildWorkflow(actions, [variable(), { ...variable(), id: 'other' }], metadata)).toThrow(/variable/i);
  expect(() => builder.buildWorkflow([{ ...actions[0], type: 'upload' }], [], metadata)).toThrow(/unsupported/i);
});

it('builds native links with an implicit link role and a stable accessible name',()=>{
  const event=parseRawEvent({...raw('link'),type:'click',value:undefined,element:{tag:'a',text:'查询新标签',accessibleName:'查询新标签',attributes:{href:'/rta',target:'_blank'},nearbyText:[],locatorCandidates:[]}});
  expect(builder.buildWorkflow(normalizeEvents([event]),[],metadata).steps[0].target).toMatchObject({fingerprint:{role:'link'},locators:[{strategy:'role',value:'查询新标签'}]});
});
