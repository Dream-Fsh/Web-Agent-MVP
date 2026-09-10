import {it,expect} from 'vitest';
import {chromium} from '@playwright/test';
import {startFixtureServer} from '@web-agent/fixture-site';
import {stepScope} from './frame.js';
import type {RunContext} from './context.js';
it('rejects missing or ambiguous frame paths instead of using the main page',async()=>{
  const fixture=await startFixtureServer();const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();await page.goto(fixture.baseUrl+'/record-contexts');page.setDefaultTimeout(1000);
    const context:RunContext={currentPage:page,browserContext:page.context(),variables:{},outputs:{},downloads:[],policy:{mode:'read-only'},runId:'r'};
    await expect(stepScope(context,{id:'s',type:'waitFor',parameters:{frame:{frameId:2,framePath:[]}}})).rejects.toThrow('no stable path');
    const child=await stepScope(context,{id:'s',type:'waitFor',parameters:{frame:{frameId:2,framePath:['iframe#query-frame']}}});expect(child.url()).toBe(fixture.baseUrl+'/rta');
    await page.locator('#query-frame').evaluate(element=>element.after(element.cloneNode(true)));
    await expect(stepScope(context,{id:'s',type:'waitFor',parameters:{frame:{frameId:2,framePath:['iframe#query-frame']}}})).rejects.toThrow();
  }finally{await browser.close();await fixture.close();}
},15000);
