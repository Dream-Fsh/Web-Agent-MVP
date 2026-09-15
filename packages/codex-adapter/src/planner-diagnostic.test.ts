import {expect,it} from 'vitest';
import {requestTaskPlan} from './planner.js';
it.each([
 ['configuration_rejected',`process.stderr.write('model provider openai reserved cannot be overridden token=SYNTHETIC_SECRET');process.exit(7)`],
 ['invalid_output',`console.log('SYNTHETIC_SECRET')`],
 ['unknown',`process.stderr.write('network quota token=SYNTHETIC_SECRET');process.exit(9)`],
 ['timeout',`setInterval(()=>{},1000)`],
])('returns safe structured %s without stderr',async(category,code)=>{
 const error=await requestTaskPlan({}, {command:[process.execPath,'-e',code,'--'],timeoutMs:category==='timeout'?100:5000}).catch(e=>e);
 expect(error.diagnostic).toMatchObject({category,phase:category==='invalid_output'?'output':'subprocess'});
 expect(error.diagnostic.elapsedMs).toBeGreaterThanOrEqual(0);
 expect(JSON.stringify(error)).not.toContain('SYNTHETIC_SECRET');expect(error.message).not.toContain('SYNTHETIC_SECRET');
 if(category==='configuration_rejected')expect(error.diagnostic.exitCode).toBe(7);
});
it('distinguishes startup failure and cancellation without invoking a real resolver',async()=>{
 const missing=await requestTaskPlan({}, {command:['nonexistent-planner-test-only']}).catch(e=>e);
 expect(missing.diagnostic).toMatchObject({category:'startup_failure',phase:'startup',exitCode:null});
 const abort=new AbortController();abort.abort();
 const cancelled=await requestTaskPlan({}, {command:[process.execPath,'-e','process.exit(99)','--'],signal:abort.signal}).catch(e=>e);
 expect(cancelled.diagnostic).toMatchObject({category:'cancelled',exitCode:null});
});
it('reports active cancellation and reaps the explicitly supplied double',async()=>{
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),200);
 try{
  const error=await requestTaskPlan({}, {command:[process.execPath,'-e','setInterval(()=>{},1000)','--'],signal:abort.signal}).catch(e=>e);
  expect(error.diagnostic).toMatchObject({category:'cancelled',phase:'subprocess'});
 }finally{clearTimeout(timer);}
});
