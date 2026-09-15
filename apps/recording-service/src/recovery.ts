import {readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {recoverPersistenceLease,type LeaseRecovery} from '@web-agent/workflow-builder/persistence';
export async function recoverRecordings(root:string):Promise<LeaseRecovery[]>{
  root=resolve(root);
  const results=[await recoverPersistenceLease(join(root,'data/recording.lock')),await recoverPersistenceLease(join(root,'data/browser-profile.lock'))];
  let workflows;
  try{workflows=await readdir(join(root,'workflows'),{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return results;}
  for(const entry of workflows.filter(entry=>entry.isDirectory()&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(entry.name)))results.push(await recoverPersistenceLease(join(root,'workflows',entry.name,'.writer.lock')));
  return results;
}
