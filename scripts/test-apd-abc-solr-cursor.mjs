import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const script=readFileSync("scripts/audit-apd-abc-solr-cursor.mjs","utf8");
test("Solr cursor read-only probe uses exact minimal projected fields, two docs per query",()=>{
 assert.match(script,/fl:"id,iddetalle,idoferta"/);
 assert.match(script,/rows=2;/);
 assert.match(script,/credentials:"omit"/);
 assert.match(script,/method:"GET"/);
 assert.match(script,/sourceName="LA MATANZA"/);
 assert.match(script,/cursorMark:cursor/);
 assert.match(script,/const candidates=\["id","iddetalle","idoferta"\]/);
 assert.doesNotMatch(script,/fetch\(.*POST|service_role|SUPABASE_SERVICE_ROLE|Authorization|apikey|addEventListener|update_file/i);
});
test("probe does not persist identifiers or claim cursorMark guarantees snapshot",()=>{
 assert.match(script,/Never include source offer identifiers/);
 assert.match(script,/overlap/);
 assert.match(script,/preliminary_cursor_behavior_supported/);
 assert.match(script,/does not establish a consistent snapshot/);
 assert.match(script,/production_changed:false/);
 assert.ok(!script.includes("report.sorts.push({keys:"));
});
