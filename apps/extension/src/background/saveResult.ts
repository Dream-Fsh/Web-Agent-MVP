export async function sendRecording(endpoint: string, capability: string, recording: unknown): Promise<{ savedPath?: string; saveError?: string }> {
  try {
    const response = await fetch(`${endpoint}/recordings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` }, body: JSON.stringify(recording), signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { saveError: '保存服务拒绝请求，请检查本地服务及录制数据。' };
    const result = await response.json() as { path?: unknown };
    if (typeof result.path === 'string') return { savedPath: result.path };
  } catch { /* A lost response does not prove the transaction failed. */ }
  return { saveError: '保存结果待确认，请检查本地 Workflow 目录。' };
}
