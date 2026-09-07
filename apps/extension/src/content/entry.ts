import { startDomRecorder, snapshot } from './recorder.js';
import type { RecorderState, RecorderMark } from '@web-agent/recorder-core';
import { redactRawEvent } from '@web-agent/safety';
import type { Target } from '@web-agent/protocol';
declare const chrome: any;

if (window === window.top) {
  const initialize = async () => {
    const host = document.createElement('web-agent-recorder');
    host.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{font:13px system-ui;color:#182238}section{width:250px;padding:16px;border:1px solid #d0d7e2;border-radius:12px;background:#fff;box-shadow:0 8px 30px #0003}h2{font-size:16px;margin:0 0 10px}button{padding:7px;margin:3px;border:1px solid #94a3b8;border-radius:5px;cursor:pointer;background:#eef2ff}input,select{box-sizing:border-box;width:100%;margin:4px 0 8px}label{display:block}p{overflow-wrap:anywhere;margin:5px 0}</style>
    <section aria-label="Web Agent Recorder"><h2>Web Agent Recorder</h2>
    <p data-testid="recording">Recording: OFF</p><p data-testid="events">Events: 0</p><p data-testid="annotations">Annotations: 0</p>
    <button id="start">开始录制</button><button id="stop">停止录制</button>
    <label>变量名<input id="variable" value="accountId"></label><label>敏感变量<input id="sensitive" type="checkbox"></label>
    <label>输出键<input id="key" value="results"></label>
    <label>提取类型<select id="extraction"><option>extractTable</option><option>extractText</option><option>extractCount</option></select></label>
    <label>断言类型<select id="assertion"><option>assertElementVisible</option><option>assertText</option></select></label>
    <label>预期值<input id="expected"></label>
    <button id="variable-mark">标记变量</button><button id="extraction-mark">标记提取</button><button id="assertion-mark">标记断言</button>
    <p id="target">当前目标：未选择</p><p id="mode">当前模式：普通录制</p><p id="session">当前 Session：无</p><p role="status" id="error"></p></section>`;
    document.documentElement.append(host);
    let state: RecorderState;
    let stop: (() => void) | undefined;
    let mode: RecorderMark['type'] | undefined;
    const get = (id: string) => root.getElementById(id)!;
    const value = (id: string) => (get(id) as HTMLInputElement).value;
    const draw = () => {
      root.querySelector('[data-testid="recording"]')!.textContent = `Recording: ${state.recording ? 'ON' : 'OFF'}`;
      root.querySelector('[data-testid="events"]')!.textContent = `Events: ${state.events.length}`;
      root.querySelector('[data-testid="annotations"]')!.textContent = `Annotations: ${state.annotations.length}`;
      get('session').textContent = `当前 Session：${state.sessionId || '无'}`;
    };
    const send = async (command: Record<string, unknown>) => {
      const response = await chrome.runtime.sendMessage({ scope: 'recorder-ui', ...command });
      if (response.error) throw new Error(response.error);
      state = response; draw(); return state;
    };
    const capture = () => {
      stop?.(); stop = undefined;
      if (state.recording) stop = startDomRecorder(document, {
        context: { sessionId: state.sessionId, url: location.href, frame: { frameId: 0, framePath: [] } },
        persist: event => { void send({ kind: 'raw-event', event }).catch(showError); },
      });
    };
    const showError = (error: unknown) => { get('error').textContent = error instanceof Error ? error.message : '录制失败'; };
    for (const kind of ['start', 'stop']) get(kind).onclick = () => {
      stop?.(); stop = undefined; mode = undefined;
      void send({ kind }).then(capture).catch(showError);
    };
    for (const [id, type] of [['variable-mark', 'variable'], ['extraction-mark', 'extraction'], ['assertion-mark', 'requiredAssertion']] as const) {
      get(id).onclick = () => {
        if (!state.recording) { showError(new Error('请先开始录制')); return; }
        mode = type; get('mode').textContent = `当前模式：${type}，请点击页面目标`;
      };
    }
    document.addEventListener('click', event => {
      if (!mode || event.composedPath().includes(host) || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const element = snapshot(event.target);
      const safe = redactRawEvent({ schemaVersion: '1.0', id: crypto.randomUUID(), sessionId: state.sessionId, timestamp: Date.now(), type: 'input', url: location.href, frame: { frameId: 0, framePath: [] }, element,
        value: event.target instanceof HTMLInputElement ? event.target.value : undefined });
      const name = element.attributes.name;
      const css = element.testId ? `[data-testid="${CSS.escape(element.testId)}"]` : element.attributes.id ? `#${CSS.escape(element.attributes.id)}` : name ? `${element.tag}[name="${CSS.escape(name)}"]` : element.tag;
      const target: Target = { fingerprint: { tag: element.tag, role: element.role }, locators: [{ strategy: 'css', value: css, score: 0.8 }] };
      const action = [...state.events].reverse().find(e => e.element?.attributes.name === name && e.element?.tag === element.tag && e.type === 'input');
      const metadata = mode === 'variable' ? { variableName: value('variable'), originalValue: safe.value, sensitive: (get('sensitive') as HTMLInputElement).checked || safe.value === '[REDACTED]' }
        : mode === 'extraction' ? { operation: value('extraction'), key: value('key') }
        : { assertionType: value('assertion'), expected: value('expected'), required: true };
      const annotation: RecorderMark = { id: crypto.randomUUID(), sessionId: state.sessionId, type: mode, target, targetActionId: mode === 'variable' ? action?.id : state.events.at(-1)?.id, metadata };
      mode = undefined; get('mode').textContent = '当前模式：普通录制'; get('target').textContent = `当前目标：${css}`;
      void send({ kind: 'annotation', annotation }).catch(showError);
    }, true);
    await send({ kind: 'status' }); capture();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize(); }, { once: true });
  else void initialize();
}
