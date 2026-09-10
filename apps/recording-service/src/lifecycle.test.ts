import { expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startRecordingService } from './index.js';
it('reports the actual extension session start to the CLI without inventing a session',async()=>{
  const root=await mkdtemp(join(tmpdir(),'record-lifecycle-'));
  const sessions:string[]=[];
  const service=await startRecordingService({root,onSessionStarted:id=>sessions.push(id)});
  try {
    const response=await fetch(service.baseUrl+'/sessions/start',{method:'POST',headers:{Authorization:`Bearer ${service.capability}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId:'actual-extension-session'})});
    expect(response.status).toBe(204);expect(sessions).toEqual(['actual-extension-session']);
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
