import { fileURLToPath } from 'node:url';
import { startRecordingService } from './index.js';
import { openAutomationBrowser } from '@web-agent/runner/browser';

export async function startInteractiveRecording(options:{root:string;url?:string;headless?:boolean;cdpPort?:number;onOutput:(line:string)=>void;signal?:AbortSignal}):Promise<void> {
  const service=await startRecordingService({root:options.root,
    onSessionStarted:id=>options.onOutput(`Recording started\nSession:\n${id}\nWaiting for browser actions...`),
    onRecordingSaved:path=>options.onOutput(`Recording saved:\n${path}`),
    onWorkflowSaved:saved=>options.onOutput(`Workflow generated:\n${saved.path}`),
  });
  try {
    const {context}=await openAutomationBrowser({root:options.root,headless:options.headless,cdpPort:options.cdpPort,extensionPath:fileURLToPath(new URL('../../extension/dist',import.meta.url))});
    try {
      const page=context.pages()[0] ?? await context.newPage();
      if(options.url)await page.goto(options.url);
      if (/^https?:/.test(page.url())) {
        // Pair inside the extension page, never pass the capability to the website.
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
        const popup = await context.newPage();
        try {
          await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
          const targetUrl = new URL(page.url());
          await popup.getByLabel('目标页面', { exact: true }).selectOption({ label: targetUrl.origin + targetUrl.pathname });
          await popup.getByLabel('本地服务地址', { exact: true }).fill(service.baseUrl);
          await popup.getByLabel('配对码', { exact: true }).fill(service.capability);
          await popup.getByRole('button', { name: '连接保存服务', exact: true }).click();
          await popup.getByRole('status').filter({ hasText: '保存服务：已连接' }).waitFor({ timeout: 10000 });
          options.onOutput('已自动连接保存服务。直接在网页点击“开始录制”，结束后点击“停止录制”。');
        } catch {
          options.onOutput('自动连接未完成，请在扩展弹窗使用下方地址和配对码手动连接。');
        } finally { await popup.close(); await page.bringToFront(); }
      }
      options.onOutput(`Recorder ready\nService: ${service.baseUrl}\nPairing code: ${service.capability}\nOpen Extension popup to pair, then click Start in the page overlay.`);
      await new Promise<void>(resolve=>{context.once('close',()=>resolve());options.signal?.addEventListener('abort',()=>{void context.close();},{once:true});if(options.signal?.aborted)void context.close();});
    }finally{await context.close();}
  }finally{await service.close();}
}
