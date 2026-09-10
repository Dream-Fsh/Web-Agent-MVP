import { expect,it } from 'vitest';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as transport from './transport.js';
it('invokes a subprocess with redacted evidence and validates the returned constrained patch',async()=>{
  expect(transport).toHaveProperty('requestRepairPatch');
  const root=await mkdtemp(join(tmpdir(),'repair-transport-'));
  try {
    const script=join(root,'provider.mjs');
    await writeFile(script,`let input='';for await(const chunk of process.stdin)input+=chunk; if(input.includes('TOKEN_SECRET'))process.exit(3);console.log(JSON.stringify({workflowId:'w',baseVersion:1,reason:'locator drift',confidence:0.9,operations:[{type:'addLocator',stepId:'q',locator:{strategy:'label',value:'账户ID',score:1}}]}));`);
    const patch=await transport.requestRepairPatch({workflow:{id:'w'},token:'TOKEN_SECRET'},{command:[process.execPath,script]});
    expect(patch).toMatchObject({workflowId:'w',baseVersion:1});
    await writeFile(script,`console.log(JSON.stringify({operations:[{type:'deleteAssertion'}]}));`);
    await expect(transport.requestRepairPatch({}, {command:[process.execPath,script]})).rejects.toThrow(/schema/i);
  }finally{await rm(root,{recursive:true,force:true});}
});

it('does not launch a model for an already cancelled repair request',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(transport.requestRepairPatch({}, {command:[process.execPath,'-e','process.exit(0)'],signal:controller.signal})).rejects.toThrow(/abort/i);
});
