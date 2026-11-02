/* State-machine rehearsal of ACTUAL runProvinciaBackfillStep/fetchAPDDistrictBatch
 * from compiled Worker candidate. All ABC/Supabase calls replaced with local stubs.
 * NO network, production keys, credentials, user data, or external writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {buildDistrictSourceAliasPreview} from "./build-apd-scanner-source-alias-preview.mjs";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";

const source=buildDistrictSourceAliasPreview(
  readFileSync("worker-live/worker_hotfix.js","utf8"),
  readFileSync("worker-live/apd_scanner_source_district_alias_candidate.mjs","utf8"));
const fn=(name)=>{
  const a=source.indexOf("function "+name+"(");
  const b=source.indexOf("\n__name("+name+",",a);
  assert.ok(a>=0&&b>a,"Cannot extract canonical Worker function "+name);
  return source.slice(a,b);
};
const compiled=[
 fn("fetchAPDDistrictBatch"),fn("buildGlobalSnapshotRow"),
 fn("loadCurrentRowsMap"),fn("buildGlobalCurrentRow"),
 fn("runProvinciaBackfillStep")
].join("\n");
const clone=x=>structuredClone(x);
const keyOf=doc=>"D_"+String(doc.iddetalle);
const fakeOffer=(i,district)=>({
  iddetalle:String(i),idoferta:String(500000+i),descdistrito:district,
  estado:"Publicada",finoferta:"2099-12-31",escuela:"ESCUELA",descripcioncargo:"INFORMATICA",
  descripcionarea:"EDUCACION",turno:"M",jornada:"SIMPLE",hsmodulos:"2",
  cursodivision:"1 1",ult_movimiento:"2026-11-02T10:00:00Z"
});
const INDEX=new Map([
 ["LA MATANZA",Array.from({length:650},(_,i)=>fakeOffer(20000+i,"LA MATANZA"))],
 ["AVELLANEDA",[fakeOffer(9001,"AVELLANEDA")]]
]);
function harness({enabled=true, failOnUpsertNumber=null, failOnSourcePage=null}={}){
  const calls=[],current=new Map(),preferences=[
    {user_id:"synthetic-user",distrito_principal:"MATANZA",otros_distritos:["AVELLANEDA"],alertas_activas:true}
  ];
  let upserts=0,state={
    scope:"PROVINCIA_FULL",status:"idle",mode:"current_published",
    district_index:0,district_name:null,next_page:0,pages_processed:0,
    districts_completed:0,offers_processed:0,last_batch_count:0,total_districts:2,
    started_at:null,finished_at:null,notes:{scanner_mode:"current_published"}
  };
  const old="2026-10-01T00:00:00Z";
  const oldMat={source_offer_key:"D_1111",distrito:"MATANZA",estado:"Publicada",
    first_seen_at:old,last_seen_at:old,times_seen:1,state_changes:0};
  const priorAv={source_offer_key:"D_9001",distrito:"AVELLANEDA",estado:"Publicada",
    first_seen_at:old,last_seen_at:old,times_seen:2,state_changes:0};
  current.set(oldMat.source_offer_key,clone(oldMat));
  current.set(priorAv.source_offer_key,clone(priorAv));
  const initial={records:clone([...current.entries()]),preferences:clone(preferences),state:clone(state)};
  const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^\p{L}\p{N}\s/().,-]/gu," ").replace(/\s+/g," ").trim();
  const ctx={
    Date,Math,URL,TextDecoder,Map,Set,console,
    PROVINCIA_SCOPE:"PROVINCIA_FULL",PROVINCIA_CAPTURE_ROWS_PER_PAGE:150,
    PROVINCIA_STEP_PAGES:4,HISTORICO_INSERT_BATCH:150,
    norm,unique:a=>[...new Set(a.filter(Boolean))],
    clampInt:(v,min,max,fallback)=>{
      const num=Number.parseInt(String(v||""),10);return Number.isFinite(num)?Math.max(min,Math.min(max,num)):fallback;
    },
    estadoHistoricoKey:norm,
    buildSourceOfferKeyFromOferta:keyOf,apdSourceDistrictForCatalog,
    mapTurnoAPD:v=>norm(v),normalizarCursoDivisionServidor:v=>String(v||""),
    escaparSolr:x=>String(x).replace(/(["\\])/g,"\\$1"),
    estadoOfertaEsPublicada:d=>norm(d.estado)==="PUBLICADA",
    ofertaVigente:d=>norm(d.estado)==="PUBLICADA"&&d.finoferta>="2026-11-02",
    isStaleProvinciaBackfill:()=>false,
    obtenerScanState:async()=>clone(state),
    saveScanState:async(_env,next)=>{calls.push({type:"scan-state",status:next.status});state=clone(next);},
    obtenerDistritosProvincia:async()=>[{nombre:"MATANZA"},{nombre:"AVELLANEDA"}],
    supabaseSelect:async(_env,query)=>{
      calls.push({type:"select"});
      assert.match(query,/^apd_ofertas_global_current\?/);
      const keys=[...query.matchAll(/source_offer_key\.eq\.([^,()]+)/g)]
        .map(x=>decodeURIComponent(x[1]));
      return keys.map(key=>current.get(key)).filter(Boolean).map(clone);
    },
    supabaseUpsert:async(_env,table,records,conflict)=>{
      assert.equal(table,"apd_ofertas_global_current");
      assert.equal(conflict,"source_offer_key");
      upserts++;
      if(failOnUpsertNumber===upserts)throw Error("SIMULATED_UPSERT_FAILURE");
      assert.ok(records.length<=150);
      for(const record of records){
        if(current.has(record.source_offer_key))
          assert.equal(record.distrito,current.get(record.source_offer_key).distrito);
        current.set(record.source_offer_key,clone(record));
      }
      calls.push({type:"upsert",count:records.length});
      return [];
    },
    supabaseRequest:async(_env,path,options)=>{
      assert.equal(options.method,"DELETE");
      const url=new URL("https://fake.invalid/rest/v1/"+path);
      assert.equal(url.pathname,"/rest/v1/apd_ofertas_global_current");
      const district=url.searchParams.get("distrito")?.slice(3);
      const bound=url.searchParams.get("last_seen_at")?.slice(3);
      assert.ok(district&&bound);
      const deleted=[];
      for(const [k,row] of current){
        if(row.distrito===district&&row.last_seen_at<bound){
          current.delete(k);deleted.push(row);
        }
      }
      calls.push({type:"prune",district,count:deleted.length});
      return deleted;
    },
    fetch:async u=>{
      const url=new URL(u);assert.equal(url.hostname,"servicios3.abc.gob.ar");
      const query=url.searchParams.get("q")||"";
      const district=/descdistrito:"([^"]+)"/.exec(query)?.[1]||"";
      assert.match(query,/estado:"Publicada"/);
      const start=Number(url.searchParams.get("start"));
      const rows=Number(url.searchParams.get("rows"));
      const page=start/rows;
      calls.push({type:"abc",district,start,rows});
      if(failOnSourcePage===page&&district==="LA MATANZA")throw Error("SIMULATED_ABC_FAILURE");
      const offers=INDEX.get(district)||[];
      const docs=offers.slice(start,start+rows);
      const data={response:{docs,numFound:offers.length}};
      return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(data)).buffer};
    }
  };
  vm.createContext(ctx);
  vm.runInContext(compiled,ctx,{timeout:2000});
  function checkPreferences(){assert.deepEqual(preferences,initial.preferences);}
  function rollback(){
    current.clear();
    for(const [key,value] of initial.records)current.set(key,clone(value));
    state=clone(initial.state);
  }
  return {ctx,current,calls,initial,preferences,rollback,checkPreferences,
    state:()=>clone(state),env:{APD_DISTRICT_SOURCE_ALIASES_ENABLED:enabled?"true":"false"}};
}
test("real scanner state machine: 650 MATANZA + 1 AVELLANEDA, paginated, canonical, dedupe, pruning",async()=>{
 const h=harness();
 let stage=await h.ctx.runProvinciaBackfillStep(h.env,{source:"test"});
 assert.equal(stage.finished,false);
 assert.equal(stage.next_page,4);
 assert.equal(stage.district_name,"MATANZA");
 assert.equal(stage.offers_processed,600);
 assert.equal(h.calls.filter(x=>x.type==="prune").length,0,
   "Never prune district before every page has been processed");
 stage=await h.ctx.runProvinciaBackfillStep(h.env,{source:"test"});
 assert.equal(stage.next_page,0);
 assert.equal(stage.districts_completed,1);
 assert.equal(stage.offers_processed,650);
 assert.equal(h.current.has("D_1111"),false,"Only stale synthetic MATANZA offer pruned");
 stage=await h.ctx.runProvinciaBackfillStep(h.env,{source:"test"});
 assert.equal(stage.finished,true);
 assert.equal(stage.districts_completed,2);
 assert.equal(stage.offers_processed,651);
 assert.equal(h.current.size,651);
 assert.equal(new Set([...h.current.keys()]).size,651);
 assert.equal(h.current.get("D_20000").distrito,"MATANZA");
 assert.equal(h.current.get("D_9001").distrito,"AVELLANEDA");
 assert.equal(h.current.get("D_9001").first_seen_at,"2026-10-01T00:00:00Z");
 assert.equal(h.current.get("D_9001").times_seen,3);
 assert.deepEqual(h.calls.filter(x=>x.type==="prune").map(x=>x.district),["MATANZA","AVELLANEDA"]);
 assert.deepEqual(h.calls.filter(x=>x.type==="abc"&&x.district==="LA MATANZA").map(x=>x.start),[0,150,300,450,600]);
 h.checkPreferences();
 h.rollback();
 assert.deepEqual([...h.current.entries()],h.initial.records,"Manual memory rollback restores original synthetic data");
 assert.deepEqual(h.state(),h.initial.state);
});
test("flag OFF retains old strict source matching and never rewrites preferences",async()=>{
 const h=harness({enabled:false});
 const result=await h.ctx.runProvinciaBackfillStep(h.env,{source:"test"});
 assert.equal(result.offers_processed,0);
 assert.equal(result.districts_completed,1);
 assert.equal(h.calls.find(x=>x.type==="abc").district,"MATANZA");
 h.checkPreferences();
 h.rollback();
 assert.deepEqual([...h.current.entries()],h.initial.records);
});
test("simulated failure during multi-page upsert leaves partial writes: DO NOT publish without recoverable backup",async()=>{
 const h=harness({enabled:true,failOnUpsertNumber:2});
 await assert.rejects(
   ()=>h.ctx.runProvinciaBackfillStep(h.env,{source:"test"}),
   /SIMULATED_UPSERT_FAILURE/
 );
 assert.equal(h.state().status,"error");
 assert.ok(h.current.size>h.initial.records.length,"Partial write remains after error: not atomic");
 assert.equal(h.calls.filter(x=>x.type==="prune").length,0,"Never prune after an upsert error");
 h.checkPreferences();
 h.rollback();
 assert.deepEqual([...h.current.entries()],h.initial.records);
 assert.deepEqual(h.state(),h.initial.state);
});
test("simulated ABC page failure stops before upsert or pruning and captures error state",async()=>{
 const h=harness({enabled:true,failOnSourcePage:2});
 await assert.rejects(
   ()=>h.ctx.runProvinciaBackfillStep(h.env,{source:"test"}),
   /SIMULATED_ABC_FAILURE/
 );
 assert.equal(h.state().status,"error");
 assert.equal(h.calls.filter(x=>x.type==="upsert").length,0);
 assert.equal(h.calls.filter(x=>x.type==="prune").length,0);
 h.rollback();
 assert.deepEqual([...h.current.entries()],h.initial.records);
});
test("published Worker is untouched and no test refers to production DB credentials",()=>{
 const live=readFileSync("worker-live/worker_hotfix.js","utf8");
 assert.ok(!live.includes("APD_DISTRICT_SOURCE_ALIASES_ENABLED"));
 assert.doesNotMatch(compiled,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});
