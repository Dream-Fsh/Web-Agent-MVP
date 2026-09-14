export async function sendRecording(endpoint: string, capability: string, recording: unknown): Promise<{ savedPath?: string; recordingPath?: string; workflowPath?: string; workflowWarning?: string; saveError?: string }> {
  try {
    const response = await fetch(`${endpoint}/recordings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` }, body: JSON.stringify(recording), signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { saveError: `保存失败（HTTP ${response.status}），请检查本地服务；录制仍保留在扩展中。` };
    const result = await response.json() as { path?: unknown; recordingPath?: unknown; workflowWarning?: unknown };
    if (typeof result.recordingPath === 'string') return { savedPath: result.recordingPath, recordingPath: result.recordingPath, workflowPath: typeof result.path === 'string' ? result.path : undefined, workflowWarning: typeof result.workflowWarning === 'string' ? result.workflowWarning : undefined };
    if (typeof result.path === 'string') return { savedPath: result.path };
  } catch { /* A lost response does not prove the transaction failed. */ }
  return { saveError: '保存结果待确认，请检查本地 data/recordings 目录，勿重复保存。' };
}
