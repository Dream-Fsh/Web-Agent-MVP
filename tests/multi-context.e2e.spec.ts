import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startFixtureServer} from '@web-agent/fixture-site';
import {startRecordingService} from '@web-agent/recording-service';
import {parseWorkflow} from '@web-agent/protocol';
import {runWorkflow} from '@web-agent/runner';

test('visible Extension records iframe actions and annotations, then replays in that frame',async()=>{
  const root=await mkdtemp(join(tmpdir(),'record-context-'));const fixture=await startFixtureServer();const bridge=await startRecordingService({root});
  const extension=resolve('apps/extension/dist');const context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(5000);
  try{
    const page=await context.newPage();await page.goto(fixture.baseUrl+'/record-contexts');
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.getByLabel('目标页面',{exact:true}).selectOption({label:fixture.baseUrl+'/record-contexts'});await popup.getByLabel('本地服务地址',{exact:true}).fill(bridge.baseUrl);await popup.getByLabel('配对码',{exact:true}).fill(bridge.capability);await popup.getByRole('button',{name:'连接保存服务',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('保存服务：已连接');await popup.close();
    const ui=page.locator('web-agent-recorder');const frame=page.frameLocator('#query-frame');
    await ui.getByRole('button',{name:'开始录制',exact:true}).click();await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    await frame.getByLabel('账户ID',{exact:true}).fill('10001');await frame.getByRole('button',{name:'查询',exact:true}).click();await expect(frame.locator('#query-result')).toContainText('10001');
    await ui.getByRole('button',{name:'标记变量',exact:true}).click();await frame.getByLabel('账户ID',{exact:true}).click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 1');
    await ui.getByRole('button',{name:'标记提取',exact:true}).click();await frame.locator('table').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 2');
    await ui.getByLabel('断言类型',{exact:true}).selectOption('assertText');await ui.getByLabel('预期值',{exact:true}).fill('{{accountId}}');await ui.getByRole('button',{name:'标记断言',exact:true}).click();await frame.locator('#query-result').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 3');
    await ui.getByRole('button',{name:'停止录制',exact:true}).click();await expect(ui.getByTestId('saved')).toContainText('已保存：');
    const [id]=await readdir(join(root,'workflows'));const workflow=parseWorkflow(JSON.parse(await readFile(join(root,'workflows',id,'v1.json'),'utf8')));
    const input=workflow.steps.find(step=>step.type==='input')!;expect(input.parameters?.frame).toMatchObject({framePath:['iframe#query-frame']});expect((input.parameters?.frame as {frameId:number}).frameId).toBeGreaterThan(0);
    expect(JSON.stringify(workflow)).not.toContain('10001');
    const replay=await chromium.launch({headless:true});try{const runPage=await replay.newPage();const result=await runWorkflow(runPage,workflow,{variables:{accountId:'20002'}});expect(result.status,JSON.stringify(result)).toBe('success');expect(result.outputs.results).toMatchObject({rows:expect.arrayContaining([expect.arrayContaining(['账户 20002 策略 001'])])});await expect(runPage.frameLocator('#query-frame').locator('#query-result')).toContainText('20002');}finally{await replay.close();}
  }finally{await context.close();await bridge.close();await fixture.close();await rm(root,{recursive:true,force:true});}
});

test('visible Extension records a new tab and continues actions, then replays with the new currentPage',async()=>{
  const root=await mkdtemp(join(tmpdir(),'record-context-'));const fixture=await startFixtureServer();const bridge=await startRecordingService({root});
  const extension=resolve('apps/extension/dist');const context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(5000);
  try{
    const page=await context.newPage();await page.goto(fixture.baseUrl+'/record-contexts');
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.getByLabel('目标页面',{exact:true}).selectOption({label:fixture.baseUrl+'/record-contexts'});await popup.getByLabel('本地服务地址',{exact:true}).fill(bridge.baseUrl);await popup.getByLabel('配对码',{exact:true}).fill(bridge.capability);await popup.getByRole('button',{name:'连接保存服务',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('保存服务：已连接');await popup.close();
    let ui=page.locator('web-agent-recorder');
    await ui.getByRole('button',{name:'开始录制',exact:true}).click();await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    const opened=page.waitForEvent('popup');await page.getByRole('link',{name:'查询新标签',exact:true}).click();const frame=await opened;
    await frame.waitForLoadState('domcontentloaded');ui=frame.locator('web-agent-recorder');await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    await frame.getByLabel('账户ID',{exact:true}).fill('10001');await frame.getByRole('button',{name:'查询',exact:true}).click();await expect(frame.locator('#query-result')).toContainText('10001');
    await ui.getByRole('button',{name:'标记变量',exact:true}).click();await frame.getByLabel('账户ID',{exact:true}).click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 1');
    await ui.getByRole('button',{name:'标记提取',exact:true}).click();await frame.locator('table').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 2');
    await ui.getByLabel('断言类型',{exact:true}).selectOption('assertText');await ui.getByLabel('预期值',{exact:true}).fill('{{accountId}}');await ui.getByRole('button',{name:'标记断言',exact:true}).click();await frame.locator('#query-result').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 3');
    await ui.getByRole('button',{name:'停止录制',exact:true}).click();await expect(ui.getByTestId('saved')).toContainText('已保存：');
    const [id]=await readdir(join(root,'workflows'));const workflow=parseWorkflow(JSON.parse(await readFile(join(root,'workflows',id,'v1.json'),'utf8')));
    expect(workflow.steps.some(step=>step.type==='switchTab'&&step.parameters?.index===1)).toBe(true);
    expect(JSON.stringify(workflow)).not.toContain('10001');
    const replay=await chromium.launch({headless:true});try{const runContext=await replay.newContext();await runContext.newPage();const runPage=await runContext.newPage();const result=await runWorkflow(runPage,workflow,{variables:{accountId:'20002'}});expect(result.status,JSON.stringify(result)).toBe('success');expect(result.outputs.results).toMatchObject({rows:expect.arrayContaining([expect.arrayContaining(['账户 20002 策略 001'])])});const replayTab=runPage.context().pages().find(p=>p!==runPage&&p.url().endsWith('/rta'))!;await expect(replayTab.locator('#query-result')).toContainText('20002');await expect(runPage.locator('#query-result')).toHaveCount(0);}finally{await replay.close();}
  }finally{await context.close();await bridge.close();await fixture.close();await rm(root,{recursive:true,force:true});}
});
