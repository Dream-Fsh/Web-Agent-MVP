import {z} from 'zod';
const schema=z.object({
 category:z.enum(['configuration_rejected','authentication_failed','startup_failure','timeout','cancelled','invalid_output','output_limit','unknown']),
 phase:z.enum(['input','startup','subprocess','output','planning']),
 exitCode:z.number().int().min(-2147483648).max(2147483647).nullable(),
 elapsedMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type PlannerDiagnostic=z.infer<typeof schema>;
const messages:Record<PlannerDiagnostic['category'],string>={configuration_rejected:'Planner configuration rejected',authentication_failed:'Planner authentication failed',startup_failure:'Planner unavailable',timeout:'Planner timed out',cancelled:'Planner cancelled (aborted)',invalid_output:'Planner response failed schema validation',output_limit:'Planner output limit exceeded',unknown:'Planner failed (unknown cause)'};
export class PlannerError extends Error {
 readonly diagnostic:PlannerDiagnostic;
 constructor(diagnostic:PlannerDiagnostic){
  const safe=schema.safeParse(diagnostic);
  const value:PlannerDiagnostic=safe.success?safe.data:{category:'unknown',phase:'planning',exitCode:null,elapsedMs:0};
  super(messages[value.category]);this.name='PlannerError';this.diagnostic=Object.freeze(value);
 }
}
export function safePlannerError(error:unknown,elapsedMs=0,aborted=false):PlannerError {
 if(error instanceof PlannerError)return new PlannerError(error.diagnostic);
 return new PlannerError({category:aborted?'cancelled':'unknown',phase:'planning',exitCode:null,elapsedMs:Math.max(0,Math.round(elapsedMs))});
}
