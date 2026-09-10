import { test,expect,chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp,readFile,readdir,writeFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { startFixtureServer } from '@web-agent/fixture-site';
import { parseWorkflow } from '@web-agent/protocol';

const binary=resolve('apps/cli/dist/bin.js');
test.setTimeout(90000);
function launch(root:string,args:string[],extraEnv:Record<string,string>={}) {
  const child=spawn(process.execPath,[binary,...args,'--root',root],{env:{...process.env,...extraEnv},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  return {child,done,output:()=>stdout,error:()=>stderr};
}
async function port() {
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function closeChrome(browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>) {
  const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});
}

test('CLI login opens and reuses only the automation profile without retaining the password',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cli-login-'));
  const fixture=await startFixtureServer();
  const children:ChildProcess[]=[]; const browsers:Awaited<ReturnType<typeof chromium.connectOverCDP>>[]=[];
  try {
    const firstPort=await port();const first=launch(root,['login','--headless','--cdp-port',String(firstPort),'--url',fixture.baseUrl+'/login']);children.push(first.child);
    await expect.poll(()=>first.output().includes('Login session ready'),{timeout:20000}).toBe(true);
    const browser=await chromium.connectOverCDP(`http://127.0.0.1:${firstPort}`);
    browsers.push(browser); const page=browser.contexts()[0].pages().find(page=>page.url().endsWith('/login'))!;
    await page.getByLabel('用户名',{exact:true}).fill('operator');
    await page.getByLabel('密码',{exact:true}).fill('NOT_SAVED_TEST_PASSWORD');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await expect(page).toHaveURL(fixture.baseUrl+'/dashboard');
    await closeChrome(browser);expect(await first.done).toBe(0);
    const secondPort=await port();const second=launch(root,['login','--headless','--cdp-port',String(secondPort),'--url',fixture.baseUrl+'/dashboard']);children.push(second.child);
    await expect.poll(()=>second.output().includes('Login session ready'),{timeout:20000}).toBe(true);
    const reopened=await chromium.connectOverCDP(`http://127.0.0.1:${secondPort}`);
    browsers.push(reopened); const resumed=reopened.contexts()[0].pages().find(page=>page.url().endsWith('/dashboard'))!;
    expect(await resumed.evaluate(()=>localStorage.getItem('fixture-user'))).toBe('operator');
    await closeChrome(reopened);expect(await second.done).toBe(0);
    const preferences=JSON.parse(await readFile(join(root,'data/browser-profile/Default/Preferences'),'utf8'));
    expect(preferences.profile.password_manager_enabled).toBe(false);
    expect(first.output()+second.output()).not.toContain('NOT_SAVED_TEST_PASSWORD');
  }finally{for(const browser of browsers)if(browser.isConnected())await closeChrome(browser);for(const child of children)if(child.exitCode===null)child.kill();await fixture.close();await rm(root,{recursive:true,force:true});}
});

test('CLI records through visible Extension UI, runs generated workflow, reads failures, repairs after replay and rolls back',async({},info)=>{
  const root=info.outputPath('cli-data');await mkdir(root,{recursive:true});
  const fixture=await startFixtureServer();let drift=false;
  const proxy=createServer(async(request,response)=>{
    const upstream=await fetch(fixture.baseUrl+(request.url??'/rta'));
    let html=await upstream.text();if(drift)html=html.replaceAll('accountId','accountCode');
    response.writeHead(upstream.status,{'content-type':'text/html'}).end(html);
  });
  await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const address=proxy.address();if(!address||typeof address==='string')throw new Error('No proxy');
  const url=`http://127.0.0.1:${address.port}/rta`;
  const children:ChildProcess[]=[]; const browsers:Awaited<ReturnType<typeof chromium.connectOverCDP>>[]=[];
  try {
    const debugPort=await port();const recorder=launch(root,['record','--headless','--cdp-port',String(debugPort),'--url',url]);children.push(recorder.child);
    await expect.poll(()=>recorder.output().includes('Recorder ready'),{timeout:20000}).toBe(true);
    const browser=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);browsers.push(browser);const context=browser.contexts()[0];
    const page=context.pages().find(page=>page.url()===url)!;
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.getByLabel('目标页面',{exact:true}).selectOption({label:url});
    await popup.getByLabel('本地服务地址',{exact:true}).fill(/Service: (http:\/\/[^\s]+)/.exec(recorder.output())![1]);
    await popup.getByLabel('配对码',{exact:true}).fill(/Pairing code: ([a-f0-9]+)/.exec(recorder.output())![1]);
    await popup.getByRole('button',{name:'连接保存服务',exact:true}).click();await expect(popup.getByRole('status')).toHaveText('保存服务：已连接');await popup.close();
    const ui=page.locator('web-agent-recorder');
    await ui.getByRole('button',{name:'开始录制',exact:true}).click();await expect(ui.getByTestId('recording')).toHaveText('Recording: ON');
    await expect.poll(()=>recorder.output().includes('Recording started')).toBe(true);
    await page.getByLabel('账户ID',{exact:true}).fill('10001');await page.getByRole('button',{name:'查询',exact:true}).click();
    await ui.getByRole('button',{name:'标记变量',exact:true}).click();await page.getByLabel('账户ID',{exact:true}).click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 1');
    await ui.getByRole('button',{name:'标记提取',exact:true}).click();await page.locator('table').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 2');
    await ui.getByLabel('断言类型',{exact:true}).selectOption('assertText');await ui.getByLabel('预期值',{exact:true}).fill('{{accountId}}');
    await ui.getByRole('button',{name:'标记断言',exact:true}).click();await page.locator('#query-result').click();await expect(ui.getByTestId('annotations')).toHaveText('Annotations: 3');
    await ui.getByRole('button',{name:'停止录制',exact:true}).click();await expect(ui.getByTestId('saved')).toContainText('已保存：');
    await expect.poll(()=>recorder.output().includes('Workflow generated:')).toBe(true);
    await page.screenshot({path:info.outputPath('cli-recorder.png')});await closeChrome(browser);expect(await recorder.done).toBe(0);
    const [id]=await readdir(join(root,'workflows'));const generated=parseWorkflow(JSON.parse(await readFile(join(root,'workflows',id,'v1.json'),'utf8')));
    expect(JSON.stringify(generated)).toContain('{{accountId}}');expect(JSON.stringify(generated)).not.toContain('10001');
    const run=launch(root,['run',id,'--headless','--var','accountId=10001','--json']);children.push(run.child);expect(await run.done).toBe(0);
    const result=JSON.parse(run.output());expect(result.status).toBe('success');expect(result.outputs.results.rows).toHaveLength(10);
    drift=true;
    const fail=launch(root,['run',id,'--headless','--var','accountId=10001','--json']);children.push(fail.child);expect(await fail.done).toBe(2);const failure=JSON.parse(fail.output());expect(failure.status).toBe('failed');
    const list=launch(root,['failures','list']);children.push(list.child);expect(await list.done).toBe(0);expect(list.output()).toContain(failure.runId);
    const provider=join(root,'fixture-codex.mjs');
    await writeFile(provider,`let text='';for await(const chunk of process.stdin)text+=chunk;const input=JSON.parse(text.trim().split('\\n').at(-1));console.log(JSON.stringify({workflowId:input.workflow.id,baseVersion:input.workflow.version,reason:'fixture locator drift',confidence:1,operations:[{type:'replaceLocator',stepId:input.workflow.steps.find(s=>s.type==='input').id,index:0,locator:{strategy:'label',value:'账户ID',score:1}}]}));`);
    const repair=launch(root,['repair',failure.runId,'--headless'],{WEB_AGENT_CODEX_COMMAND:JSON.stringify([process.execPath,provider])});children.push(repair.child);expect(await repair.done,repair.error()).toBe(0);expect(repair.output()).toContain('Replay: PASS');
    expect(JSON.parse(await readFile(join(root,'workflows',id,'current.json'),'utf8'))).toEqual({currentVersion:2});
    const rollback=launch(root,['workflow','rollback',id,'1']);children.push(rollback.child);expect(await rollback.done).toBe(0);
    expect(JSON.parse(await readFile(join(root,'workflows',id,'current.json'),'utf8'))).toEqual({currentVersion:1});expect(await readFile(join(root,'workflows',id,'v2.json'),'utf8')).toContain('账户ID');
    await writeFile(info.outputPath('cli-demo.txt'),['web-agent run: '+run.output(),'web-agent failures list: '+list.output(),'web-agent repair (fixture subprocess transport): '+repair.output(),'web-agent workflow rollback: '+rollback.output()].join('\n'));
  }finally{for(const browser of browsers)if(browser.isConnected())await closeChrome(browser);for(const child of children)if(child.exitCode===null)child.kill();await new Promise<void>(resolve=>{proxy.close(()=>resolve());proxy.closeAllConnections();});await fixture.close();await rm(join(root,'data/browser-profile'),{recursive:true,force:true});}
});
