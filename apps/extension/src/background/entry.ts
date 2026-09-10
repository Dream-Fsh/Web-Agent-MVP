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
    const sourceTabId = message.kind === 'connect' ? message.tabId : sender.tab.id;
    if (!Number.isInteger(sourceTabId)) throw new Error('Invalid tab');
    const tab = await chrome.tabs.get(sourceTabId);
    if (!/^https?:/.test(tab.url ?? '')) throw new Error('Unsupported tab');
    let tabId=sourceTabId;
    const ownerKey=`owner-${sourceTabId}`;
    const linked=(await chrome.storage.session.get(ownerKey))[ownerKey];
    if(Number.isInteger(linked))tabId=linked;
    else if(message.kind!=='connect' && Number.isInteger(tab.openerTabId)){
      const openerOwner=(await chrome.storage.session.get(`owner-${tab.openerTabId}`))[`owner-${tab.openerTabId}`]??tab.openerTabId;
      const openerState=(await chrome.storage.session.get(`recording-${openerOwner}`))[`recording-${openerOwner}`];
      if(openerState?.recording){tabId=openerOwner;await chrome.storage.session.set({[ownerKey]:tabId});}
    }
    const membersKey=`members-${tabId}`;
    let members:number[]=(await chrome.storage.session.get(membersKey))[membersKey]??[tabId];
    if(!members.includes(sourceTabId)){members.push(sourceTabId);await chrome.storage.session.set({[membersKey]:members});}
    const key = `recording-${tabId}`;
    const stored = await chrome.storage.session.get(key);
    let state: RecorderState = stored[key] ?? emptyRecorderState();
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
    if (message.kind === 'start') {
      message.url = sender.tab.url;members=[sourceTabId];
      await chrome.storage.session.set({[membersKey]:members,[`active-tab-${tabId}`]:sourceTabId});
    }
    const activeKey=`active-tab-${tabId}`;
    const active=(await chrome.storage.session.get(activeKey))[activeKey]??tabId;
    if(state.recording && sourceTabId!==active && (sender.frameId??0)===0 && ['status','raw-event','annotation'].includes(message.kind)){
      state=updateRecorder(state,{kind:'raw-event',event:{schemaVersion:'1.0',id:crypto.randomUUID(),sessionId:state.sessionId,timestamp:Date.now(),type:'tab-change',url:tab.url,frame:{frameId:0,framePath:[]},metadata:{tabId:sourceTabId,index:members.indexOf(sourceTabId)}}});
      await chrome.storage.session.set({[activeKey]:sourceTabId});
    }
    if(message.event)message.event.metadata={...message.event.metadata,tabId:sourceTabId,...(message.event.type==='tab-change'?{index:members.indexOf(sourceTabId)}:{})};
    if (message.event) message.event.frame.frameId = sender.frameId ?? 0;
    const next: RecorderState & { connected?: boolean; savedPath?: string; saveError?: string } = updateRecorder(state, message);
    next.connected = Boolean(connection);
    await chrome.storage.session.set({ [key]: next });
    if (message.kind === 'start' && connection) {
      await fetch(`${connection.endpoint}/sessions/start`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.capability}`},body:JSON.stringify({sessionId:next.sessionId}),signal:AbortSignal.timeout(5000)}).catch(()=>undefined);
    }
    if (message.kind === 'stop') {
      await chrome.storage.local.set({ [key]: next });
      if (connection) {
        Object.assign(next, await sendRecording(connection.endpoint, connection.capability, { sessionId: next.sessionId, events: next.events, annotations: next.annotations }));
      } else next.saveError = '尚未连接保存服务，Workflow 未生成。';
      await chrome.storage.session.set({ [key]: next });
    }
    if(message.kind!=='status')await Promise.all(members.map(member=>chrome.tabs.sendMessage(member,{scope:'recorder-state',state:next,markMode:message.kind==='mark-mode'?message.markMode:undefined,fields:message.fields,sensitive:message.sensitive,clearMode:message.kind==='annotation'||message.kind==='stop'}).catch(()=>undefined)));
    reply(next);
  }).catch(() => { reply({ error: '录制操作失败，请检查当前会话。' }); });
  return true;
});
