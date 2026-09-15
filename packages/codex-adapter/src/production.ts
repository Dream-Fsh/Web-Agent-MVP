import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseWorkflow} from '@web-agent/protocol';
import {readFailurePackage} from '@web-agent/failure';
import {loadWorkflow} from '@web-agent/workflow-builder/persistence';
import {executeStoredRun,type StoredRunOptions} from '@web-agent/runner/production';
import {redactSensitiveData} from '@web-agent/safety';
import {promoteRepairPatch} from './index.js';
import {requestRepairPatch} from './transport.js';

export async function repairStoredRun(runId:string,options:StoredRunOptions) {
  options.signal?.throwIfAborted();
  const failure=await readFailurePackage(join(options.root,'data/failures'),runId);
  const snapshot=parseWorkflow(failure.workflow);
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(snapshot.startUrl).hostname))throw new Error('Real-site repair requires manual review; automatic replay/promote is disabled');
  const workflowsRoot=options.workflowsRoot??join(options.root,'workflows');
  const workflow=await loadWorkflow(workflowsRoot,snapshot.id);
  if(workflow.version!==snapshot.version)throw new Error('Stale failure workflow version');
  const run=JSON.parse(await readFile(join(options.root,'data/runs',runId+'.json'),'utf8')) as {variables:Record<string,string|number|boolean>};
  const variables={...run.variables,...options.variables};
  const patch=await requestRepairPatch({workflow,failure},{signal:options.signal});
  options.signal?.throwIfAborted();
  await writeFile(join(options.root,'data/failures',runId,'repair.patch.json'),JSON.stringify(redactSensitiveData(patch),null,2)+'\n');
  return promoteRepairPatch(workflowsRoot,workflow.id,workflow,patch,async candidate=>{
    const result=await executeStoredRun(candidate,{...options,variables,localOnly:true});
    options.signal?.throwIfAborted();
    return {requiredAssertionsPassed:result.status==='success'};
  },options.signal);
}
