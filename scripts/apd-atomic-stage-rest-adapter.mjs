/* ISOLATED PostgREST adapter for apd_scanner_pilot schema ONLY.
 * Intentionally refuses production hosts and deletes; NO deployed Worker wiring.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISTRICT=/^[A-Z0-9 ÁÉÍÓÚÜÑ()\/.,'-]{2,100}$/u;
const integer=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const iso=t=>typeof t==="string"&&Number.isFinite(Date.parse(t));
function permittedHost(url){
  return ["localhost","127.0.0.1","[::1]"].includes(url.hostname) ||
    url.hostname.endsWith(".invalid");
}
export function createAtomicStagePilotClient({baseUrl,fetchImpl,enabled=false}){
  if(enabled!==true)throw Error("Pilot adapter disabled; not a production interface");
  const base=new URL(baseUrl);
  if(!permittedHost(base)||!["http:","https:"].includes(base.protocol)||
    base.username||base.password||base.pathname!=="/"||base.search||base.hash)
    throw Error("Pilot adapter refuses non-isolated host");
  if(typeof fetchImpl!=="function")throw Error("Missing injected fetch");
  const headers={"Content-Type":"application/json",
    "Accept":"application/json","Content-Profile":"apd_scanner_pilot",
    "Accept-Profile":"apd_scanner_pilot"};
  async function request(path,body){
    const res=await fetchImpl(new URL(path,base).href,{
      method:"POST",credentials:"omit",redirect:"error",headers,
      body:JSON.stringify(body)
    });
    if(!res||res.ok!==true)throw Error("Isolated capture API rejected request (HTTP "+(res?.status??"unknown")+")");
    try {return await res.json();}catch{throw Error("Isolated capture API returned malformed JSON");}
  }
  const validateRun=runId=>{
    if(typeof runId!=="string"||!UUID.test(runId))throw Error("Invalid capture run UUID");
  };
  const validateDistrict=d=>{
    if(typeof d!=="string"||!DISTRICT.test(d))throw Error("Invalid canonical district");
  };
  return Object.freeze({
    async createRun({runId,district,expectedPages,captureStartedAt,capturedAt}){
      validateRun(runId);validateDistrict(district);
      if(!integer(expectedPages,1,700)||!iso(captureStartedAt)||!iso(capturedAt)||
        Date.parse(capturedAt)<Date.parse(captureStartedAt))
        throw Error("Invalid capture plan");
      const body={run_id:runId,distrito:district,expected_offers:0,
        expected_pages:expectedPages,completed_pages:0,
        stage_verified:false,allow_prune:false,status:"ready",
        capture_started_at:captureStartedAt,captured_at:capturedAt};
      return request("runs",body);
    },
    async stagePage({runId,pageIndex,sourceTotal,rows}){
      validateRun(runId);
      if(!integer(pageIndex,0,699)||!integer(sourceTotal,0,100000)||
        !Array.isArray(rows)||rows.length>150)
        throw Error("Invalid stage page");
      const keys=new Set();
      const projected=rows.map(row=>{
        const key=row?.source_offer_key,district=row?.distrito,estado=row?.estado;
        validateDistrict(district);
        if(typeof key!=="string"||!key.trim()||key.length>300||
          estado!=="Publicada"||keys.has(key))
          throw Error("Invalid or repeated offer in staged page");
        keys.add(key);
        // No raw ABC payload, IDs, names of people, user preferences or personal data.
        return {source_offer_key:key,distrito:district,estado};
      });
      return request("rpc/stage_page",{p_run_id:runId,
        p_page_index:pageIndex,p_source_total:sourceTotal,p_rows:projected});
    },
    async seal(runId){
      validateRun(runId);
      return request("rpc/seal_capture",{p_run_id:runId});
    },
    async finalizeWithoutPruning(runId){
      validateRun(runId);
      // Never automatically retry finalize: HTTP timeouts can occur AFTER COMMIT.
      // Database rejects replay, but callers should inspect run status on ambiguity.
      const result=await request("rpc/finalize_district",{
        p_run_id:runId,p_prune:false,p_inject_error_for_test:false
      });
      if(!Array.isArray(result)||result.length!==1||
        !integer(result[0]?.upserted,0,100000)||
        result[0]?.pruned!==0)
        throw Error("Isolated finalize returned invalid non-destructive result");
      return {upserted:result[0].upserted,pruned:0};
    }
  });
}
