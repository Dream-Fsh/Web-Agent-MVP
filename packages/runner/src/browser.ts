import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface AutomationBrowserOptions { root: string; headless?: boolean; extensionPath?: string; cdpPort?: number; localOnly?:boolean }

/** Uses only the app-owned automation profile, never a user's daily Chrome profile. */
export async function openAutomationBrowser(options: AutomationBrowserOptions) {
  const profile = resolve(options.root, 'data/browser-profile');
  await mkdir(join(profile,'Default'),{recursive:true});
  const preferencesPath = join(profile,'Default/Preferences');
  let preferences: Record<string, unknown> = {};
  try { preferences = JSON.parse(await readFile(preferencesPath,'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  preferences.credentials_enable_service = false;
  preferences.profile = {...(preferences.profile as object ?? {}),password_manager_enabled:false};
  await writeFile(preferencesPath,JSON.stringify(preferences));
  const args: string[] = [];
  if (options.extensionPath) args.push(`--disable-extensions-except=${resolve(options.extensionPath)}`,`--load-extension=${resolve(options.extensionPath)}`);
  if (options.cdpPort !== undefined) {
    if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1 || options.cdpPort > 65535) throw new Error('Invalid CDP port');
    args.push('--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${options.cdpPort}`);
  }
  const context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:options.headless ?? false,args,serviceWorkers:options.localOnly?'block':'allow'});
  if(options.localOnly) {
    const allowed=(url:string)=>{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);};
    await context.route('**/*',async route=>{
      if(!allowed(route.request().url()))return route.abort('blockedbyclient');
      try {
        // Fetch one hop only so redirects cannot escape the repair boundary.
        const response=await route.fetch({maxRedirects:0});
        const location=response.headers().location;
        if(location && !allowed(new URL(location,route.request().url()).href))return route.abort('blockedbyclient');
        await route.fulfill({response});
      }catch{await route.abort('failed').catch(()=>{});}
    });
  }
  context.setDefaultTimeout(5000);
  return {context,profile};
}
