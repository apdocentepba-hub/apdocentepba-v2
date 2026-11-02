import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ddl=readFileSync("tests/sql/apd_atomic_full_24col_pg17.sql","utf8");
const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const expected={
 source_offer_key:"text",idoferta:"text",iddetalle:"text",estado:"text",
 distrito:"text",escuela:"text",cargo:"text",area:"text",
 nivel_modalidad:"text",turno:"text",jornada:"text",hsmodulos:"text",
 cursodivision:"text",supl_desde:"text",supl_hasta:"text",finoferta:"text",
 ult_movimiento:"text",first_seen_at:"timestamptz",last_seen_at:"timestamptz",
 last_state_change_at:"timestamptz",times_seen:"bigint",
 state_changes:"bigint",raw:"jsonb",updated_at:"timestamptz"
};
test("full test table exactly matches 24-column production Supabase read-only schema",()=>{
 const start=ddl.indexOf("CREATE TABLE apd_scanner_pilot.current_offers_full (");
 const end=ddl.indexOf("\n);",start);
 assert.ok(start>=0&&end>start);
 const body=ddl.slice(start,end);
 const rows=[...body.matchAll(/^\s*([a-z_]+)\s+(text|timestamptz|bigint|jsonb)\b/gm)];
 const columns=Object.fromEntries(rows.map(m=>[m[1],m[2]]));
 assert.equal(rows.length,24);
 assert.deepEqual(columns,expected);
 assert.ok(ddl.includes("first_seen_at timestamptz NOT NULL"));
 assert.ok(ddl.includes("state_changes bigint NOT NULL"));
 assert.ok(ddl.includes("raw jsonb"));
});
test("Worker actually creates all 24 fields and no unmodeled field",()=>{
 const start=worker.indexOf("function buildGlobalCurrentRow(");
 const stop=worker.indexOf("\n__name(buildGlobalCurrentRow",start);
 assert.ok(start>0&&stop>start);
 const fn=worker.slice(start,stop);
 const names=[...fn.matchAll(/^\s+([a-z_]+):\s/gm)].map(m=>m[1]);
 assert.equal(names.length,24);
 assert.deepEqual(names,Object.keys(expected));
 assert.ok(fn.includes("last_state_change_at: stateChanged ? capturedAt"));
 assert.ok(fn.includes("raw: snapshotRow.raw"));
});
test("full stage SQL cannot be mistaken for a live Supabase migration",()=>{
 assert.doesNotMatch(ddl,/CREATE\s+TABLE\s+public\.|DROP\s+TABLE|SECURITY\s+DEFINER/i);
 assert.match(ddl,/SECURITY INVOKER/);
 assert.match(ddl,/p_inject_error_for_test/);
 assert.match(ddl,/INJECTED_FULL_ROW_FAILURE/);
 assert.match(ddl,/pruned integer/);
 const setup=readFileSync("tests/sql/test_apd_atomic_full_24col_pg17.sh","utf8");
 assert.match(setup,/set -euo pipefail/);
 assert.match(setup,/state_changes=3/);
 assert.match(setup,/raw->'nested'/);
 assert.match(setup,/INJECTED_FULL_ROW_FAILURE/);
});
