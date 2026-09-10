import { expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as failure from './index.js';
it('lists persisted failure packages and reads bounded evidence by run id',async()=>{
  expect(failure).toHaveProperty('listFailurePackages');
  expect(failure).toHaveProperty('readFailurePackage');
  const root=await mkdtemp(join(tmpdir(),'failure-catalog-'));
  try {
    await failure.saveFailurePackage({runId:'run1',stepId:'query',error:'no match',workflow:{id:'w'},target:{},domContext:{nearbyText:['查询'],structure:['button']}},root);
    expect(await failure.listFailurePackages(root)).toMatchObject([{runId:'run1',stepId:'query',workflowId:'w',reason:'no match',createdAt:expect.any(String)}]);
    expect(await failure.readFailurePackage(root,'run1')).toMatchObject({runId:'run1',stepId:'query',workflow:{id:'w'},domContext:{nearbyText:['查询']}});
    await expect(failure.readFailurePackage(root,'../escape')).rejects.toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
});
