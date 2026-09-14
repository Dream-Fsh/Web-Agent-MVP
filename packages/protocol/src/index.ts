import { z } from "zod";

export const RAW_EVENT_TYPES = [
  "click", "dblclick", "input", "change", "submit", "navigation", "tab-change", "upload", "drag-drop",
  "scroll", "keydown", "focus", "contextmenu",
] as const;
export type RawEventType = (typeof RAW_EVENT_TYPES)[number];

export const STEP_TYPES = [
  "navigate", "click", "input", "select", "waitFor", "switchTab", "extract", "assert", "download",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export interface LocatorCandidate {
  strategy: "testId" | "role" | "label" | "placeholder" | "attribute" | "text" | "css";
  value: string;
  score: number;
}

export interface Target {
  fingerprint: { tag?: string; role?: string; text?: string; nearbyText?: string[] };
  locators: LocatorCandidate[];
}

export interface ElementSnapshot {
  tag: string;
  role?: string;
  text?: string;
  ariaLabel?: string;
  accessibleName?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  attributes: Record<string, string>;
  nearbyText: string[];
  bbox?: { x: number; y: number; width: number; height: number };
  locatorCandidates: LocatorCandidate[];
}

export interface RawEvent {
  schemaVersion: "1.0";
  id: string;
  sessionId: string;
  timestamp: number;
  type: RawEventType;
  url: string;
  frame: { frameId: number; framePath: string[]; frameUrl?: string };
  element?: ElementSnapshot;
  value?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowVariable {
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  defaultValue?: string | number | boolean;
}

export interface WorkflowMetadata {
  createdAt: string;
  updatedAt: string;
  sourceSessionId?: string;
  tags?: string[];
}

export interface WorkflowStep {
  id: string;
  type: StepType;
  target?: Target;
  url?: string;
  parameters?: Record<string, unknown>;
}

export interface Workflow {
  schemaVersion: "1.0";
  id: string;
  version: number;
  name: string;
  startUrl: string;
  variables: Record<string, WorkflowVariable>;
  steps: WorkflowStep[];
  metadata: WorkflowMetadata;
}

const locatorCandidateSchema = z.object({
  strategy: z.enum(["testId", "role", "label", "placeholder", "attribute", "text", "css"]),
  value: z.string().min(1),
  score: z.number().min(0).max(1),
}).strict();

const targetSchema = z.object({
  fingerprint: z.object({
    tag: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    nearbyText: z.array(z.string().min(1)).optional(),
  }).strict(),
  locators: z.array(locatorCandidateSchema).min(1),
}).strict();

const elementSnapshotSchema = z.object({
  tag: z.string().min(1),
  role: z.string().min(1).optional(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  accessibleName: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  testId: z.string().optional(),
  attributes: z.record(z.string(), z.string()),
  nearbyText: z.array(z.string()),
  bbox: z.object({
    x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative(),
  }).strict().optional(),
  locatorCandidates: z.array(locatorCandidateSchema),
}).strict();

const rawEventSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  timestamp: z.number().finite().nonnegative(),
  type: z.enum(RAW_EVENT_TYPES),
  url: z.string().url(),
  frame: z.object({
    frameId: z.number().int().nonnegative(), framePath: z.array(z.string()), frameUrl: z.string().url().optional(),
  }).strict(),
  element: elementSnapshotSchema.optional(),
  value: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

const interactiveStepTypes: ReadonlySet<StepType> = new Set([
  "click", "input", "select", "extract", "download",
]);

const workflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(STEP_TYPES),
  target: targetSchema.optional(),
  url: z.string().url().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((step, context) => {
  if (interactiveStepTypes.has(step.type) && !step.target) {
    context.addIssue({ code: "custom", path: ["target"], message: `${step.type} steps require a target` });
  }
  if (step.type === "navigate" && !step.url) {
    context.addIssue({ code: "custom", path: ["url"], message: "navigate steps require a url" });
  }
});

const workflowSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  startUrl: z.string().url(),
  variables: z.record(z.string().min(1), z.object({
    description: z.string().min(1).optional(),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }).strict()),
  steps: z.array(workflowStepSchema),
  metadata: z.object({
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(), sourceSessionId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
  }).strict(),
}).strict().superRefine((workflow, context) => {
  const stepIds = new Set<string>();
  workflow.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) {
      context.addIssue({ code: "custom", path: ["steps", index, "id"], message: `duplicate step id: ${step.id}` });
    }
    stepIds.add(step.id);
  });
});

export class RawEventValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];
  public constructor(issues: z.core.$ZodIssue[]) {
    super("RawEvent validation failed");
    this.name = "RawEventValidationError";
    this.issues = issues;
  }
}

export class WorkflowValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];
  public constructor(issues: z.core.$ZodIssue[]) {
    super("Workflow validation failed");
    this.name = "WorkflowValidationError";
    this.issues = issues;
  }
}

export function parseRawEvent(input: unknown): RawEvent {
  const result = rawEventSchema.safeParse(input);
  if (!result.success) throw new RawEventValidationError(result.error.issues);
  return result.data;
}

export function parseWorkflow(input: unknown): Workflow {
  const result = workflowSchema.safeParse(input);
  if (!result.success) throw new WorkflowValidationError(result.error.issues);
  return result.data;
}

export interface RecordingAnnotation {
  id: string;
  sessionId: string;
  type: 'variable' | 'extraction' | 'requiredAssertion';
  targetActionId?: string;
  target: Target;
  metadata: Record<string, unknown>;
}
const annotationBase = {
  id: z.string().min(1), sessionId: z.string().min(1),
  targetActionId: z.string().min(1).optional(), target: targetSchema,
};
const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const annotationSchema = z.discriminatedUnion('type', [
  z.object({ ...annotationBase, type: z.literal('variable'), targetActionId: z.string().min(1),
    metadata: z.object({ originalValue: z.string(), variableName: identifier, sensitive: z.boolean() }).strict(),
  }).strict(),
  z.object({ ...annotationBase, type: z.literal('extraction'),
    metadata: z.object({ operation: z.enum(['extractText', 'extractTable', 'extractCount', 'extractList']), key: identifier }).strict(),
  }).strict(),
  z.object({ ...annotationBase, type: z.literal('requiredAssertion'),
    metadata: z.object({ assertionType: z.enum(['assertVisible', 'assertText', 'assertCount']), expected: z.union([z.string(), z.number()]), required: z.literal(true) }).strict(),
  }).strict(),
]).superRefine((annotation, context) => {
  if (annotation.type === 'variable' && annotation.metadata.sensitive && annotation.metadata.originalValue !== '[REDACTED]')
    context.addIssue({ code: 'custom', message: 'Sensitive variable must not contain its actual value' });
});
export function parseRecordingAnnotation(input: unknown): RecordingAnnotation {
  return annotationSchema.parse(input);
}
export function validateAnnotationReferences(annotations: RecordingAnnotation[], events: RawEvent[], sessionId: string): void {
  const ids = new Set<string>();
  for (const annotation of annotations) {
    if (ids.has(annotation.id)) throw new Error('Duplicate annotation id');
    ids.add(annotation.id);
    if (annotation.sessionId !== sessionId) throw new Error('Annotation session does not match');
    const event = events.find(event => event.id === annotation.targetActionId && event.sessionId === sessionId);
    if (annotation.targetActionId && !event) throw new Error('Invalid annotation action reference');
    if (annotation.type === 'variable' && event?.type !== 'input' && event?.type !== 'change') throw new Error('Variable annotation requires an input action');
  }
}
