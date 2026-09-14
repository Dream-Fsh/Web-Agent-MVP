import { startDomRecorder, snapshot } from './recorder.js';
import { readInitialState } from './initialState.js';
import type { RecorderState, RecorderMark } from '@web-agent/recorder-core';
import { redactRawEvent } from '@web-agent/safety';
import type { Target } from '@web-agent/protocol';
declare const chrome: any;

{
  const initialize = async () => {
    const host = document.createElement('web-agent-recorder');
    host.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{font:13px system-ui;color:#182238}section{width:250px;max-height:calc(100vh - 64px);overflow:auto;padding:16px;border:1px solid #d0d7e2;border-radius:12px;background:#fff;box-shadow:0 8px 30px #0003}h2{font-size:16px;margin:0 0 10px}button{padding:7px;margin:3px;border:1px solid #94a3b8;border-radius:5px;cursor:pointer;background:#eef2ff}input,select{box-sizing:border-box;width:100%;margin:4px 0 8px}label{display:block}p{overflow-wrap:anywhere;margin:5px 0}</style>
    <section aria-label="Web Agent Recorder"><h2>Web Agent Recorder</h2>
    <p>开始后正常操作网页，停止时保存操作记录。</p><p data-testid="connection">保存服务：未连接</p><p data-testid="saved"></p>
    <p data-testid="recording">Recording: OFF</p><p data-testid="events">Events: 0</p>
    <button id="start" disabled>开始录制</button><button id="stop" disabled>停止录制</button>
    <p role="status" id="error"></p>
    <details><summary>高级选项（可选）</summary>
    <label><input id="generate-workflow" type="checkbox">同时尝试生成重放工作流</label>
    <p>下面的标注不是保存操作记录的必要条件。</p><p data-testid="annotations">Annotations: 0</p>
    <label>变量名<input id="variable" value="accountId"></label><label>敏感变量<input id="sensitive" type="checkbox"></label>
    <label>输出键<input id="key" value="results"></label>
    <label>提取类型<select id="extraction" aria-label="提取类型"><option value="extractTable">表格</option><option value="extractText">文本</option><option value="extractCount">数量</option></select></label>
    <label>断言类型<select id="assertion" aria-label="断言类型"><option value="assertVisible">目标可见</option><option value="assertText">包含文本</option></select></label>
    <label>预期值<input id="expected"></label>
    <button id="variable-mark">标记变量</button><button id="extraction-mark">标记提取</button><button id="assertion-mark">标记断言</button>
    <p id="target">当前目标：未选择</p><p id="mode">当前模式：普通录制</p><p id="session">当前 Session：无</p></details></section>`;
    if(window===window.top)document.documentElement.append(host);
    const frameContext=()=>{
      const framePath:string[]=[];let current:Window=window;
      while(current!==current.top){
        const frame=current.frameElement;if(!frame)throw new Error('当前跨域 frame 尚不支持录制');
        const selector=frame.id?`iframe#${CSS.escape(frame.id)}`:frame.getAttribute('name')?`iframe[name="${CSS.escape(frame.getAttribute('name')!)}"]`:frame.getAttribute('title')?`iframe[title="${CSS.escape(frame.getAttribute('title')!)}"]`:undefined;
        if(!selector||frame.ownerDocument.querySelectorAll(selector).length!==1)throw new Error('Frame 缺少唯一标识');
        framePath.unshift(selector);current=current.parent;
      }
      return {frameId:0,framePath};
    };
    let state: RecorderState & { connected?: boolean; savedPath?: string; saveError?: string; workflowWarning?: string };
    let busy = true;
    let stop: (() => void) | undefined;
    let mode: RecorderMark['type'] | undefined;
    const get = (id: string) => root.getElementById(id)!;
    const value = (id: string) => (get(id) as HTMLInputElement).value;
    const draw = () => {
      root.querySelector('[data-testid="recording"]')!.textContent = `Recording: ${state.recording ? 'ON' : 'OFF'}`;
      root.querySelector('[data-testid="events"]')!.textContent = `Events: ${state.events.length}`;
      root.querySelector('[data-testid="annotations"]')!.textContent = `Annotations: ${state.annotations.length}`;
      get('session').textContent = `当前 Session：${state.sessionId || '无'}`;
      root.querySelector('[data-testid="connection"]')!.textContent = `保存服务：${state.connected ? '已连接' : '未连接'}`;
      root.querySelector('[data-testid="saved"]')!.textContent = state.savedPath ? `已保存：${state.savedPath}` : state.saveError ?? '';
      if (state.workflowWarning) root.querySelector('[data-testid="saved"]')!.textContent += `\n${state.workflowWarning}`;
      (get('start') as HTMLButtonElement).disabled = busy || state.recording;
      (get('stop') as HTMLButtonElement).disabled = busy || (!state.recording && (!state.events.length || Boolean(state.savedPath)));
    };
    const send = async (command: Record<string, unknown>) => {
      const response = await chrome.runtime.sendMessage({ scope: 'recorder-ui', ...command });
      if (response.error) throw new Error(response.error);
      state = response; draw(); return state;
    };
    const capture = () => {
      stop?.(); stop = undefined;
      if (state.recording) stop = startDomRecorder(document, {
        context: { sessionId: state.sessionId, url: location.href, frame: frameContext() },
        persist: event => { void send({ kind: 'raw-event', event }).catch(showError); },
      });
    };
    const showError = (error: unknown) => { get('error').textContent = error instanceof Error ? error.message : '录制失败'; };
    for (const kind of ['start', 'stop']) get(kind).onclick = event => {
      if (!event.isTrusted || busy) return;
      get('error').textContent = kind === 'stop' ? '正在保存…' : '';
      busy = true; draw();
      stop?.(); stop = undefined; mode = undefined;
      void send({ kind, generateWorkflow: (get('generate-workflow') as HTMLInputElement).checked })
        .then(() => { get('error').textContent = ''; capture(); }).catch(showError)
        .finally(() => { busy = false; draw(); });
    };
    for (const [id, type] of [['variable-mark', 'variable'], ['extraction-mark', 'extraction'], ['assertion-mark', 'requiredAssertion']] as const) {
      get(id).onclick = event => {
        if (!event.isTrusted) return;
        if (!state.recording) { showError(new Error('请先开始录制')); return; }
        mode = type;
        void send({kind:'mark-mode',markMode:type,fields:Object.fromEntries(['variable','key','extraction','assertion','expected'].map(id=>[id,value(id)])),sensitive:(get('sensitive') as HTMLInputElement).checked}).catch(showError);
        get('mode').textContent = `当前模式：${type}，请点击页面目标`;
      };
    }
    document.addEventListener('click', event => {
      if (!event.isTrusted || !mode || event.composedPath().includes(host) || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const selected = mode === 'extraction' && value('extraction') === 'extractTable' ? event.target.closest('table') : event.target;
      if (!selected) { showError(new Error('表格提取请点击结果表格内的任意位置。')); return; }
      const element = snapshot(selected);
      const safe = redactRawEvent({ schemaVersion: '1.0', id: crypto.randomUUID(), sessionId: state.sessionId, timestamp: Date.now(), type: 'input', url: location.href, frame: frameContext(), element,
        value: event.target instanceof HTMLInputElement ? event.target.value : undefined });
      const name = element.attributes.name;
      const css = element.testId ? `[data-testid="${CSS.escape(element.testId)}"]` : element.attributes.id ? `#${CSS.escape(element.attributes.id)}` : name ? `${element.tag}[name="${CSS.escape(name)}"]` : element.tag;
      if (document.querySelectorAll(css).length !== 1) { showError(new Error('目标不唯一，请选择具有稳定标识的元素。')); return; }
      const target: Target = { fingerprint: { tag: element.tag, role: element.role }, locators: [{ strategy: 'css', value: css, score: 0.8 }] };
      const action = [...state.events].reverse().find(e => e.element?.attributes.name === name && e.element?.tag === element.tag && e.type === 'input' && JSON.stringify(e.frame.framePath)===JSON.stringify(frameContext().framePath));
      const metadata = mode === 'variable' ? { variableName: value('variable'), originalValue: safe.value, sensitive: (get('sensitive') as HTMLInputElement).checked || safe.value === '[REDACTED]' }
        : mode === 'extraction' ? { operation: value('extraction'), key: value('key') }
        : { assertionType: value('assertion'), expected: value('expected'), required: true };
      const annotation: RecorderMark = { id: crypto.randomUUID(), sessionId: state.sessionId, type: mode, target, targetActionId: mode === 'variable' ? action?.id : [...state.events].reverse().find(e=>JSON.stringify(e.frame.framePath)===JSON.stringify(frameContext().framePath))?.id, metadata };
      mode = undefined; get('mode').textContent = '当前模式：普通录制'; get('target').textContent = `当前目标：${css}`;
      void send({ kind: 'annotation', annotation }).catch(showError);
    }, true);
    chrome.runtime.onMessage.addListener((message:any)=>{
      if(message.scope!=='recorder-state')return;
      if(message.markMode){mode=message.markMode;for(const [id,text] of Object.entries(message.fields??{}))(get(id) as HTMLInputElement).value=String(text);(get('sensitive') as HTMLInputElement).checked=Boolean(message.sensitive);}
      if(message.clearMode)mode=undefined;
      if(message.state){const changed=!state||state.sessionId!==message.state.sessionId||state.recording!==message.state.recording;state=message.state;draw();if(changed)capture();}
    });
    try { state = await readInitialState(() => send({ kind: 'status' })); }
    catch { showError(new Error('录制面板初始化失败，请刷新网页后重试。')); return; }
    // The extension's session survives a normal document navigation or reload.
    if (state.recording) await send({ kind: 'raw-event', event: redactRawEvent({ schemaVersion: '1.0', id: crypto.randomUUID(), sessionId: state.sessionId, timestamp: Date.now(), type: 'navigation', url: location.href, frame: frameContext(), metadata: { navigationKind: 'document' } }) });
    capture(); busy = false; draw();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize(); }, { once: true });
  else void initialize();
}
