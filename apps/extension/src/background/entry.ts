import { emptyRecorderState, updateRecorder, type RecorderState } from '@web-agent/recorder-core';
import { sendRecording } from './saveResult.js';

declare const chrome: any;
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message: any, sender: any, reply: (value: unknown) => void) => {
  if (message?.scope !== 'recorder-ui') return;
  const popup = sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html');
  if (message.kind === 'connect' ? !popup : !sender.tab) return;
  // Serialize storage read/modify/write so rapid input cannot lose events.
  pending = pending.then(async () => {
    const tabId = message.kind === 'connect' ? message.tabId : sender.tab.id;
    if (!Number.isInteger(tabId)) throw new Error('Invalid tab');
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:/.test(tab.url ?? '')) throw new Error('Unsupported tab');
    const key = `recording-${tabId}`;
    const stored = await chrome.storage.session.get(key);
    const state: RecorderState = stored[key] ?? emptyRecorderState();
    const connectionKey = `connection-${tabId}`;
    let connection = (await chrome.storage.session.get(connectionKey))[connectionKey];
    if (message.kind === 'connect') {
      const url = new URL(message.endpoint);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new Error('Only local recording services are supported');
      const candidate = { endpoint: url.origin, capability: String(message.capability) };
      const health = await fetch(`${candidate.endpoint}/health`, { headers: { Authorization: `Bearer ${candidate.capability}` }, signal: AbortSignal.timeout(5000) });
      if (!health.ok) throw new Error('Pairing failed');
      connection = candidate;
      await chrome.storage.session.set({ [connectionKey]: connection });
    }
    if (message.kind === 'start') message.url = sender.tab.url;
    if (message.event) message.event.frame.frameId = sender.frameId ?? 0;
    const next: RecorderState & { connected?: boolean; savedPath?: string; saveError?: string } = updateRecorder(state, message);
    next.connected = Boolean(connection);
    await chrome.storage.session.set({ [key]: next });
    if (message.kind === 'stop') {
      await chrome.storage.local.set({ [key]: next });
      if (connection) {
        Object.assign(next, await sendRecording(connection.endpoint, connection.capability, { sessionId: next.sessionId, events: next.events, annotations: next.annotations }));
      } else next.saveError = '尚未连接保存服务，Workflow 未生成。';
      await chrome.storage.session.set({ [key]: next });
    }
    reply(next);
  }).catch(() => { reply({ error: '录制操作失败，请检查当前会话。' }); });
  return true;
});
