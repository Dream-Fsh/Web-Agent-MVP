import { parseRecordingAnnotation, parseWorkflow, type ElementSnapshot, type Target, type Workflow, type WorkflowStep, type RecordingAnnotation } from '@web-agent/protocol';
import type { NormalizedAction } from '@web-agent/normalizer';
import { redactUrl, redactSensitiveData } from '@web-agent/safety';

export interface WorkflowBuildMetadata {
  id: string; name: string; sessionId: string; startUrl: string; createdAt: string;
  version?: number; updatedAt?: string;
}

function targetFor(element?: ElementSnapshot): Target {
  if (!element) throw new Error('Action requires an element target');
  const role = element.role ?? (element.tag === 'button' ? 'button' : element.tag==='a' && element.attributes.href ? 'link' : undefined);
  const name = element.label ?? element.ariaLabel ?? element.accessibleName ?? element.text ?? element.attributes.name;
  const locators = [...element.locatorCandidates];
  if (!locators.length) {
    if (element.testId) locators.push({ strategy: 'testId', value: element.testId, score: 1 });
    else if (element.label || element.ariaLabel) locators.push({ strategy: 'label', value: (element.label ?? element.ariaLabel)!, score: 1 });
    else if (role && name) locators.push({ strategy: 'role', value: name, score: 1 });
    else if (element.attributes.name) locators.push({ strategy: 'attribute', value: `name=${element.attributes.name}`, score: 0.9 });
    else if (element.attributes.id) locators.push({ strategy: 'attribute', value: `id=${element.attributes.id}`, score: 0.9 });
    else throw new Error('No stable locator for action');
  }
  return redactSensitiveData({ fingerprint: { tag: element.tag, role, text: name }, locators });
}

/** Pure recording-to-DSL transformation. Every return crosses protocol validation. */
export function buildWorkflow(actions: NormalizedAction[], inputs: RecordingAnnotation[], metadata: WorkflowBuildMetadata): Workflow {
  const annotations = inputs.map(parseRecordingAnnotation);
  const references = new Map<string, NormalizedAction>();
  for (const action of actions) {
    if (action.context.sessionId !== metadata.sessionId) throw new Error('Action session mismatch');
    for (const id of new Set([action.id, ...action.sourceEventIds])) {
      if (references.has(id)) throw new Error('Duplicate action reference');
      references.set(id, action);
    }
  }
  const annotationIds = new Set<string>();
  const variables: Workflow['variables'] = {};
  const actionVariables = new Map<NormalizedAction, string>();
  for (const annotation of annotations) {
    if (annotationIds.has(annotation.id)) throw new Error('Duplicate annotation id');
    annotationIds.add(annotation.id);
    if (annotation.sessionId !== metadata.sessionId) throw new Error('Annotation session mismatch');
    const action = annotation.targetActionId ? references.get(annotation.targetActionId) : undefined;
    if (annotation.targetActionId && !action) throw new Error('Invalid annotation action reference');
    if (annotation.type === 'variable') {
      if (!action || action.type !== 'input') throw new Error('Variable requires input action');
      const name = String(annotation.metadata.variableName);
      if (Object.hasOwn(variables, name) || actionVariables.has(action)) throw new Error('Duplicate variable annotation');
      Object.defineProperty(variables, name, { value: { required: true, sensitive: annotation.metadata.sensitive === true }, enumerable: true });
      actionVariables.set(action, name);
    }
  }
  const steps: WorkflowStep[] = [];
  const add = (step: Omit<WorkflowStep, 'id'>) => steps.push({ id: `step-${steps.length + 1}`, ...step });
  const addAnnotation = (annotation: RecordingAnnotation) => {
    const frame=annotation.targetActionId?references.get(annotation.targetActionId)?.context.frame:undefined;
    if (annotation.type === 'extraction') add({ type: 'extract', target: annotation.target, parameters: { frame, operation: annotation.metadata.operation, key: annotation.metadata.key } });
    if (annotation.type === 'requiredAssertion') add({ type: 'assert', parameters: { frame, assertions: [{ id: annotation.id, type: annotation.metadata.assertionType, target: annotation.target, expected: annotation.metadata.expected, required: true }] } });
  };
  for (const action of [...actions].sort((a, b) => a.timestamp - b.timestamp)) {
    const frame = { ...action.context.frame, ...(action.context.frame.frameUrl ? { frameUrl: redactUrl(action.context.frame.frameUrl) } : {}) };
    const parameters: Record<string, unknown> = { frame };
    switch (action.type) {
      case 'focus': break; // Focusing is implicit in the following click/input.
      case 'navigate': add({ type: 'navigate', url: redactUrl(action.url), parameters }); break;
      case 'input':
      case 'select': {
        const variable = actionVariables.get(action);
        if (action.value === '[REDACTED]' && !variable) throw new Error('Redacted input requires a variable annotation');
        parameters.value = variable ? `{{${variable}}}` : action.value;
        if (parameters.value === undefined) throw new Error('Input action lacks a value');
        add({ type: action.type, target: targetFor(action.element), parameters }); break;
      }
      case 'click': case 'waitFor': case 'download': add({ type: action.type, target: targetFor(action.element), parameters }); break;
      case 'switchTab': {
        const index = action.metadata?.index;
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) throw new Error('SwitchTab requires a stable tab index');
        add({ type: 'switchTab', parameters: { ...parameters, index, scope: 'recording' } }); break;
      }
      default: throw new Error(`Unsupported recorded action: ${action.type}`);
    }
    for (const annotation of annotations) if (annotation.targetActionId && references.get(annotation.targetActionId) === action) addAnnotation(annotation);
  }
  for (const annotation of annotations) if (!annotation.targetActionId) addAnnotation(annotation);
  return parseWorkflow({ schemaVersion: '1.0', id: metadata.id, version: metadata.version ?? 1, name: redactSensitiveData(metadata.name), startUrl: redactUrl(metadata.startUrl), variables, steps: redactSensitiveData(steps),
    metadata: { createdAt: metadata.createdAt, updatedAt: metadata.updatedAt ?? metadata.createdAt, sourceSessionId: metadata.sessionId } });
}
