type VariableValue = string | number | boolean;

export function resolveWorkflowValue<T>(value: T, variables: Record<string, VariableValue>): T {
  if (typeof value === "string") {
    return value.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g, (_match, name: string) => String(variables[name] ?? _match)) as T;
  }
  if (Array.isArray(value)) return value.map((item) => resolveWorkflowValue(item, variables)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveWorkflowValue(item, variables)])) as T;
  return value;
}
