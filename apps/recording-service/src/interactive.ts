import { fileURLToPath } from 'node:url';
import { startRecordingService } from './index.js';
import { openAutomationBrowser } from '@web-agent/runner/browser';

export async function startInteractiveRecording(options:{root:string;url?:string;headless?:boolean;cdpPort?:number;onOutput:(line:string)=>void;signal?:AbortSignal}):Promise<void> {
  const service=await startRecordingService({root:options.root,
    onSessionStarted:id=>options.onOutput(`Recording started\nSession:\n${id}\nWaiting for browser actions...`),
    onWorkflowSaved:saved=>options.onOutput(`Workflow generated:\n${saved.path}`),
  });
  try {
    const {context}=await openAutomationBrowser({root:options.root,headless:options.headless,cdpPort:options.cdpPort,extensionPath:fileURLToPath(new URL('../../extension/dist',import.meta.url))});
    try {
      const page=context.pages()[0] ?? await context.newPage();
      if(options.url)await page.goto(options.url);
      options.onOutput(`Recorder ready\nService: ${service.baseUrl}\nPairing code: ${service.capability}\nOpen Extension popup to pair, then click Start in the page overlay.`);
      await new Promise<void>(resolve=>{context.once('close',()=>resolve());options.signal?.addEventListener('abort',()=>{void context.close();},{once:true});if(options.signal?.aborted)void context.close();});
    }finally{await context.close();}
  }finally{await service.close();}
}
