import type {BrowserContext,Page,Route,CDPSession} from '@playwright/test';
import {assertOriginAllowed,UnsafeActionBlockedError,type SafetyPolicy} from '@web-agent/safety';

/** Chromium request-stage interception checks every redirect before network I/O. */
export async function guardOrigins(context:BrowserContext,startUrl:string,policy:SafetyPolicy){
  assertOriginAllowed(startUrl,startUrl,policy);
  let blocked:Error|undefined;
  const pending=new Set<Promise<void>>();
  const deny=(message:string)=>{blocked??=new UnsafeActionBlockedError('unknown',message);};
  const worker=(worker:{url():string})=>{if(/^https?:/.test(worker.url()))deny('Service Worker context is not supported for guarded execution');};
  context.serviceWorkers().forEach(worker);
  context.on('serviceworker',worker);
  // Existing controlled documents are rejected; fresh run contexts also use serviceWorkers:block.
  await context.addInitScript(()=>{if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>{throw new Error('Service Worker registration blocked during workflow execution');};});
  const sessions=new Map<Page,Promise<CDPSession>>();
  const configure=(page:Page)=>{
    let promise=sessions.get(page);
    if(!promise){promise=(async()=>{
      const session=await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.setBypassServiceWorker',{bypass:true});
      session.on('Fetch.requestPaused',event=>{
        const job=(async()=>{
          try {assertOriginAllowed(event.request.url,startUrl,policy);await session.send('Fetch.continueRequest',{requestId:event.requestId});}
          catch(error){blocked??=error instanceof UnsafeActionBlockedError?error:new UnsafeActionBlockedError('unknown','Origin interception failed');await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}
        })();pending.add(job);void job.finally(()=>pending.delete(job)).catch(()=>{});
      });
      await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});      return session;
    })();sessions.set(page,promise);}
    return promise;
  };
  // A popup's first request precedes Playwright's Page/Frame objects. Fetch it
  // without redirects; never release an unguarded browser redirect chain.
  const route=async(route:Route)=>{
    const request=route.request();
    try{
      assertOriginAllowed(request.url(),startUrl,policy);
      if(request.headers()['service-worker'])throw new UnsafeActionBlockedError('unknown','Service Worker registration blocked');
      let page:Page|undefined;
      try{page=request.frame().page();}catch{if(!request.isNavigationRequest())throw new Error('Request frame unavailable');}
      if(!page){
        const response=await route.fetch({maxRedirects:0});
        try{
          if(response.status()>=300&&response.status()<400){
            const location=response.headers().location;
            if(location)assertOriginAllowed(new URL(location,request.url()).href,startUrl,policy);
            throw new UnsafeActionBlockedError('unknown','Initial popup redirects require an established page identity');
          }
          await route.fulfill({response});
        }finally{await response.dispose();}
        return;
      }
      await configure(page);
      await route.fallback();
    }catch(error){blocked??=error instanceof UnsafeActionBlockedError?error:new UnsafeActionBlockedError('unknown','Cannot install origin guard');await route.abort('blockedbyclient').catch(()=>{});}
  };
  const handler=(r:Route)=>{const job=route(r);pending.add(job);void job.finally(()=>pending.delete(job)).catch(()=>{});return job;};
  const opened=(page:Page)=>{const job=configure(page).then(()=>{},()=>{deny('Cannot install popup origin guard');});pending.add(job);void job.finally(()=>pending.delete(job));};
  context.on('page',opened);
  await context.route('**/*',handler);
  await Promise.all(context.pages().map(configure));
  const check=async(page:Page)=>{
    await Promise.all([...pending]);if(blocked)throw blocked;
    assertOriginAllowed(page.url(),startUrl,policy);
    for(const frame of page.frames()){
      // Playwright can expose an empty URL before a child document commits.
      const url=frame.url() || await frame.evaluate(()=>location.href);
      if(url!=='about:blank')assertOriginAllowed(url,startUrl,policy);
    }
    if(await page.evaluate(()=>Boolean(navigator.serviceWorker?.controller)))throw new UnsafeActionBlockedError('unknown','Controlled Service Worker page is unsupported');
  };
  return {check,assertReady(){if(blocked)throw blocked;},async close(){await context.unroute('**/*',handler);context.off('serviceworker',worker);context.off('page',opened);await Promise.all([...sessions.values()].map(async promise=>{const session=await promise.catch(()=>undefined);if(session){await session.send('Fetch.disable').catch(()=>{});await session.detach().catch(()=>{});}}));}};
}