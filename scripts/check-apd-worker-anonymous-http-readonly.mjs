/* APD production Worker: anonymous read-only pre-deploy HTTP smoke.
 * Queries ONLY unauthenticated endpoints and dummy UUID. Never POSTs, writes,
 * uses user sessions, downloads personal data, or sends notifications.
 * This check does not test authenticated user outcomes or optimized candidate.
 */
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
const ORIGIN="https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const DUMMY="00000000-0000-4000-8000-000000000000";
const cases=[
 {method:"GET",path:"/api/mis-alertas?user_id="+DUMMY,expect:401},
 {method:"GET",path:"/api/mi-plan?user_id="+DUMMY,expect:401},
 {method:"GET",path:"/api/historico-resumen?user_id="+DUMMY,expect:401},
 {method:"GET",path:"/api/version",expect:200},
 {method:"GET",path:"/api/planes",expect:200},
 {method:"OPTIONS",path:"/api/mis-alertas",expect:200}
];
export async function checkAnonymous({request=fetch,origin=ORIGIN,addCases=[]}={}){
 const root=new URL(origin);
 assert.equal(root.protocol,"https:");assert.equal(root.hostname,new URL(ORIGIN).hostname);
 const entries=[...cases,...addCases];
 const outcomes=[];
 for(const c of entries){
  assert.ok(c.method==="GET"||c.method==="OPTIONS","Read-only methods only");
  assert.ok(c.path.startsWith("/api/"),"API path must be rooted");
  const target=new URL(c.path,root);
  assert.equal(target.origin,root.origin);
  const response=await request(target.toString(),{
   method:c.method,redirect:"error",cache:"no-store",credentials:"omit",
   headers:{Accept:"application/json"},
   signal:AbortSignal.timeout(12000)
  });
  assert.equal(response.status,c.expect,
   "Unexpected anonymous HTTP status on "+c.method+" "+target.pathname);
  outcomes.push({method:c.method,path:target.pathname,status:response.status});
 }
 return {
  anonymous_http_contracts_verified:outcomes.length,
  denied_unauthorized_requests:outcomes.filter(x=>x.status===401).length,
  public_readonly_routes:outcomes.filter(x=>x.status===200).length,
  personal_data_read:false,account_login_performed:false,
  traffic_deployed:false,write_request_count:0
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{console.log("APD_WORKER_ANONYMOUS_HTTP_SMOKE_OK "+JSON.stringify(await checkAnonymous()));}
 catch(err){console.error("APD_WORKER_ANONYMOUS_HTTP_SMOKE_FAIL "+String(err?.message||err));process.exitCode=1;}
}
