/* Final combined candidate: ABC source filtering, bounded PID, conservative
 * closure gate in all email paths, and bulk offer sync. Only the sync routine
 * differs from the independently tested deadline candidate. No deployment.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
const input="tmp/apd-close-safe-research/worker_hotfix.js";
const output="tmp/apd-ready-worker/worker_hotfix.js";
const pinned="f7c8b7ead6a5b10bc6e715677898f4aae8428373833ff9f2d8b9c69a19b63289";
const hash=s=>createHash("sha256").update(s).digest("hex");
const source=readFileSync(input,"utf8");
assert.equal(hash(source),pinned,"STOP: deadline-guard candidate source changed");
const name="syncUserOfferState";
const start=source.indexOf("async function "+name+"(");
const end=source.indexOf("\n__name("+name+",",start);
assert.ok(start>0&&end>start,"Missing syncUserOfferState");
const original=source.slice(start,end);
const first="  const activeIds = [];\n  const offersList = Array.isArray(offers) ? offers : [];";
const newFirst="  const activeIds = [];\n  const upserts = /* @__PURE__ */ new Map();\n  const offersList = Array.isArray(offers) ? offers : [];";
assert.equal(original.split(first).length,2,"Unexpected activeIds declaration");
let modified=original.replace(first,newFirst);
const loopStart=modified.indexOf("    const upsertResp = await fetch(");
const loopEnd=modified.indexOf("  }\n  const uniqueActiveIds =",loopStart);
assert.ok(loopStart>0&&loopEnd>loopStart,"Unexpected sequential POST block");
const prior=modified.slice(loopStart,loopEnd);
assert.ok(prior.includes("JSON.stringify(payload)")&&prior.includes("on_conflict=user_id,offer_id")&&prior.includes("throw new Error"),"Unrecognized old upsert");
modified=modified.slice(0,loopStart)+"    upserts.set(id, payload);\n"+modified.slice(loopEnd);
const pivot="  const uniqueActiveIds = [...new Set(activeIds)];";
assert.equal(modified.split(pivot).length,2,"Missing activeIds dedup");
const batch=[
'  // PostgREST accepts arrays for bulk upsert; cap requests at 100 rows.',
'  // Repeated offer IDs use the final payload, preserving sequential last-write-wins.',
'  // Group rows by shape: never send first_seen_at on an existing row.',
'  // PostgREST arrays need homogeneous columns to preserve original timestamps.',
'  const updates = []; const inserts = [];',
'  for (const row of upserts.values()) {',
'    (Object.prototype.hasOwnProperty.call(row, "first_seen_at") ? inserts : updates).push(row);',
'  }',
'  for (const pending of [updates, inserts]) {',
'    for (let offset = 0; offset < pending.length; offset += 100) {',
'      const batchRows = pending.slice(offset, offset + 100);',
'    const upsertResp = await fetch(',
'      env.SUPABASE_URL + "/rest/v1/user_offer_state?on_conflict=user_id,offer_id",',
'      {',
'        method: "POST",',
'        headers: {',
'          "Content-Type": "application/json",',
'          apikey: env.SUPABASE_SERVICE_ROLE_KEY,',
'          Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,',
'          Prefer: "resolution=merge-duplicates"',
'        },',
'        body: JSON.stringify(batchRows)',
'      }',
'    );',
'    if (!upsertResp.ok) {',
'      const text = await upsertResp.text().catch(() => "");',
'      throw new Error("No se pudo upsert user_offer_state (lote desde " + offset',
'        + ", " + batchRows.length + " ofertas): " + upsertResp.status + " " + text);',
'    }',
'  }',
'  }'
].join("\n")+"\n";
modified=modified.replace(pivot,batch+pivot);
const code=source.slice(0,start)+modified+source.slice(end);
assert.notEqual(code,source);
assert.equal(code.replace(modified,original),source,"STOP: changes escaped syncUserOfferState");
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,code);
console.log("APD_FINAL_COMBINED_CANDIDATE_OK "+JSON.stringify({
 status:"research_only_no_upload",base_sha256:pinned,
 candidate_sha256:hash(code),only_changed_function:name,
 ready_for_authenticated_test:true,
 max_rows_per_post:100,uploaded_worker_unchanged:true,production_unchanged:true
}));
