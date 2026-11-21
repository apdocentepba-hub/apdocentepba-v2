/* LAB ONLY: build a guarded alternative of the existing cargo catalog delegate.
 * No edits to app_v2_cargo_delegate_fix.js or production assets.
 * A remote catalog response may never overwrite an input after local edits,
 * a user/session switch, or a new canonicalization pass.
 */
import {readFileSync,writeFileSync} from "node:fs";
const source=readFileSync("app_v2_cargo_delegate_fix.js","utf8");
const before=[
 "      const current = String(input.value || '').trim();",
 "      if (!current) continue;",
 "",
 "      const next = await resolveCatalogLabel(current);",
 "      if (seq !== canonicalizeSeq) return;",
 "",
 "      if (next) {",
 "        input.value = next;",
 "      }"
].join("\n");
const after=[
 "      const current = String(input.value || '').trim();",
 "      if (!current) continue;",
 "      // This helper is only safe when the experimental editor guard is active.",
 "      const guard = window.__APD_LAB_PREF_GUARD;",
 "      if (!guard || guard.dirty || guard.state !== 'ready') continue;",
 "      const revision = guard.revision;",
 "      const owner = guard.owner;",
 "",
 "      const next = await resolveCatalogLabel(current);",
 "      if (seq !== canonicalizeSeq) return;",
 "      // Another request, account, form edit, or programmatic selector may have",
 "      // changed the field while the async catalog lookup was pending.",
 "      if (window.__APD_LAB_PREF_GUARD !== guard ||",
 "          guard.owner !== owner || guard.state !== 'ready' ||",
 "          guard.dirty || guard.revision !== revision ||",
 "          document.getElementById(id) !== input ||",
 "          String(input.value || '').trim() !== current) continue;",
 "",
 "      if (next) input.value = next;"
].join("\n");
const count=source.split(before).length-1;
if(count!==1)throw Error("Unique canonicalization anchor missing: "+count);
const output="tmp/apd-alerts-performance/app_v2_cargo_delegate_guard_candidate.js";
writeFileSync(output,source.replace(before,after));
console.log(JSON.stringify({
 candidate:output,source:"app_v2_cargo_delegate_fix.js",
 production_unchanged:true,no_network_added:true,no_deployment:true,
 requires_verified_editor_guard:true,prevents_late_catalog_clobber:true
}));
