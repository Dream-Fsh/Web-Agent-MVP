import {expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildWorkflow} from '@web-agent/workflow-builder';
import {saveFailurePackage} from '@web-agent/failure';
import * as production from './production.js';
it('requires manual review for real-site repair before requesting a model or opening a browser',async()=>{
  expect(production).toHaveProperty('repairStoredRun');
  const root=await mkdtemp(join(tmpdir(),'repair-site-boundary-'));
  try {
    const workflow=buildWorkflow([],[],{id:'w',name:'w',sessionId:'s',startUrl:'https://ads.example.test/rta',createdAt:new Date().toISOString()});
    await saveFailurePackage({runId:'r',stepId:'q',error:'missing',workflow,target:{},domContext:{nearbyText:[],structure:[]}},join(root,'data/failures'));
    await expect(production.repairStoredRun('r',{root,headless:true})).rejects.toThrow(/manual review/i);
  }finally{await rm(root,{recursive:true,force:true});}
});
