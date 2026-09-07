import { emptyRecorderState, updateRecorder, type RecorderState } from '@web-agent/recorder-core';

declare const chrome: any;
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message: any, sender: any, reply: (value: unknown) => void) => {
  if (!sender.tab || message?.scope !== 'recorder-ui') return;
  // Serialize storage read/modify/write so rapid input cannot lose events.
  pending = pending.then(async () => {
    const key = `recording-${sender.tab.id}`;
    const stored = await chrome.storage.session.get(key);
    const state: RecorderState = stored[key] ?? emptyRecorderState();
    if (message.event) message.event.frame.frameId = sender.frameId ?? 0;
    const next = updateRecorder(state, message);
    await chrome.storage.session.set({ [key]: next });
    if (message.kind === 'stop') await chrome.storage.local.set({ [key]: next });
    reply(next);
  }).catch(() => { reply({ error: '录制操作失败，请检查当前会话。' }); });
  return true;
});
