import { join, resolve } from 'node:path';
import { listWorkflows, loadWorkflow, workflowHistory, rollbackStoredWorkflow } from '@web-agent/workflow-builder/persistence';
import { runStoredWorkflow } from '@web-agent/runner/production';
import { openAutomationBrowser } from '@web-agent/runner/browser';
import { listFailurePackages } from '@web-agent/failure';
import { parseArguments } from './arguments.js';

export interface CliOptions { root?:string; workflowsRoot?:string; onOutput?:(line:string)=>void; onExitCode?:(code:number)=>void; signal?:AbortSignal }
const help = `web-agent login [--url URL]
web-agent record [--url URL]
web-agent agent skills
web-agent agent skills register <manifest.json> --confirm [--var name=value]
web-agent agent skills enable <skillId> --confirm
web-agent agent skills disable <skillId>
web-agent agent plan "<task>" [--var name=value] [--skill skillId]
web-agent agent execute <planId> --confirm [--headless]
web-agent agent cancel <planId>
web-agent agent result <planId>
web-agent recording recover
web-agent workflow list
web-agent workflow inspect <id>
web-agent workflow history <id>
web-agent workflow rollback <id> <version>
web-agent run <id> [--var name=value] [--headless] [--json]
web-agent failures list
web-agent repair <runId> [--var name=value] [--headless]
Options: --root DIR, --cdp-port PORT (local debugging only)`;

export async function runCli(args:string[],options:CliOptions={}):Promise<string> {
  if (args[0] === 'agent') {
    const { runAgentCli } = await import('./agent/cli.js');
    return runAgentCli(args, options);
  }
  const parsed=parseArguments(args);
  if(parsed.help || !parsed.positional.length)return help;
  const [command,subcommand,name,version]=parsed.positional;
  const root=resolve(parsed.root ?? options.root ?? process.cwd());
  const workflowsRoot=options.workflowsRoot ?? join(root,'workflows');
  const output=options.onOutput ?? (()=>{});
  if(command==='recording' && subcommand==='recover' && parsed.positional.length===2){
    const {recoverRecordings}=await import('@web-agent/recording-service');
    return (await recoverRecordings(root)).map(result=>`${result.status}\t${result.path}${result.archive?'\t'+result.archive:''}`).join('\n');
  }
  if(command==='workflow') {
    if(subcommand==='list' && parsed.positional.length===2) {
      const list=await listWorkflows(workflowsRoot);
      return list.length ? 'ID\tVersion\tUpdated\n'+list.map(workflow=>`${workflow.id}\tv${workflow.version}\t${workflow.metadata.updatedAt}`).join('\n') : 'No workflows';
    }
    if(subcommand==='inspect' && name && parsed.positional.length===3)return JSON.stringify(await loadWorkflow(workflowsRoot,name),null,2);
    if(subcommand==='history' && name && parsed.positional.length===3)return (await workflowHistory(workflowsRoot,name)).map(workflow=>`v${workflow.version}.json`).join('\n');
    if(subcommand==='rollback' && name && version && parsed.positional.length===4) {await rollbackStoredWorkflow(workflowsRoot,name,Number(version));return `Workflow ${name}: current=v${version}`;}
    throw new Error('Invalid workflow command');
  }
  if(command==='run' && subcommand && parsed.positional.length===2) {
    const result=await runStoredWorkflow(subcommand,{root,workflowsRoot,headless:parsed.headless,variables:parsed.variables,signal:options.signal});
    if(result.status!=='success')options.onExitCode?.(2);
    return parsed.json ? JSON.stringify(result,null,2) : `Workflow: ${result.workflowId}\nRunId: ${result.runId}\n${result.steps.map(step=>`${step.type}\t${step.status==='completed'?'PASS':step.status.toUpperCase()}${step.message?'\t'+step.message:''}`).join('\n')}\nResult: ${result.status.toUpperCase()}\nOutputs:\n${JSON.stringify(result.outputs,null,2)}`;
  }
  if(command==='failures' && subcommand==='list' && parsed.positional.length===2) {
    const failures=await listFailurePackages(join(root,'data/failures'));
    return failures.length?'RunId\tWorkflow\tStep\tReason\tCreatedAt\n'+failures.map(item=>`${item.runId}\t${item.workflowId}\t${item.stepId}\t${item.reason}\t${item.createdAt}`).join('\n'):'No failures';
  }
  if(command==='login' && parsed.positional.length===1) {
    const {context,profile}=await openAutomationBrowser({root,headless:parsed.headless,cdpPort:parsed.cdpPort});
    try {
      const page=context.pages()[0] ?? await context.newPage();
      if(parsed.url)await page.goto(parsed.url);
      output(`Login session ready\nProfile:\n${profile}\nClose the browser when manual login is complete.`);
      await new Promise<void>(resolve=>{context.once('close',()=>resolve());options.signal?.addEventListener('abort',()=>{void context.close();},{once:true});if(options.signal?.aborted)void context.close();});
      return 'Login session closed';
    } finally {await context.close();}
  }
  if(command==='record' && parsed.positional.length===1) {
    const {startInteractiveRecording}=await import('@web-agent/recording-service');
    await startInteractiveRecording({root,url:parsed.url,headless:parsed.headless,cdpPort:parsed.cdpPort,onOutput:output,signal:options.signal});
    return 'Recording session closed';
  }
  if(command==='repair' && subcommand && parsed.positional.length===2) {
    const {repairStoredRun}=await import('@web-agent/codex-adapter/production');
    const result=await repairStoredRun(subcommand,{root,workflowsRoot,headless:parsed.headless,variables:parsed.variables,signal:options.signal});
    return `Workflow repaired: ${result.id}\nVersion: v${result.version}\nReplay: PASS\ncurrent=v${result.version}`;
  }
  throw new Error('Unknown command or invalid arguments');
}
