/* LAB ONLY: take the instrumented candidate, retain profile + plan as
 * critical path, hydrate preferences asynchronously, fail closed on unknown
 * entitlement, and never modify production files. Not deployable.
 */
import {readFileSync,writeFileSync} from "node:fs";
const input="tmp/apd-alerts-performance/app_v2_telemetry_candidate.js";
const text=readFileSync(input,"utf8");
const start=text.indexOf("async function cargarDashboard() {");
const end=text.indexOf("\nfunction renderDashboard(",start);
if(start<0||end<=start)throw Error("Expected one dashboard function");
let dashboard=text.slice(start,end);
let renderer=text.slice(end);
function edit(source,oldValue,newValue,label){
 const count=source.split(oldValue).length-1;
 if(count!==1)throw Error(label+": expected one source match, got "+count);
 return source.replace(oldValue,newValue);
}
function d(oldValue,newValue,label){
 dashboard=edit(dashboard,oldValue,newValue,label);
}
d("  const alertasPromise = obtenerMisAlertas(token)",
  [
   "  // Source errors are captured immediately; no unhandled rejection.",
   "  const apdPrefsPromise = obtenerPreferenciasPorUserId(token)",
   "    .then(raw => ({ok:true,raw}))",
   "    .catch(error => ({ok:false,error}));",
   "  const alertasPromise = obtenerMisAlertas(token)"
  ].join("\n"),"start independent preferences");
d(
 [
 "    const [docente, prefRaw, planInfo] = await Promise.all([",
 "      obtenerDocentePorId(token),",
 "      obtenerPreferenciasPorUserId(token),",
 "      obtenerMiPlan(token)",
 "    ]);"
 ].join("\n"),
 [
 "    const [docente, planInfo] = await Promise.all([",
 "      obtenerDocentePorId(token),",
 "      obtenerMiPlan(token)",
 "    ]);"
 ].join("\n"),"remove preferences from critical path");
d("    const preferencias = adaptarPreferencias(prefRaw);",
  "    const preferencias = adaptarPreferencias(null);","initial placeholder preferences");
d("    window.__APD_LAB_PERF.markProfile(apdLabRun);\n    cargarPrefsEnFormulario({ preferencias });",
  [
 "    window.__APD_LAB_PERF.markProfile(apdLabRun);",
 "    const prefBox = document.getElementById('panel-preferencias-resumen');",
 "    if(prefBox)prefBox.textContent = 'Cargando preferencias...';",
 "    void apdPrefsPromise.then(result => {",
 "      if(!current())return;",
 "      const summary=document.getElementById('panel-preferencias-resumen');",
 "      if(!result.ok){",
 "        if(summary)summary.textContent = 'No pudimos verificar tus preferencias. Reintentá desde el panel.';",
 "        return;",
 "      }",
 "      try{",
 "        const actual=adaptarPreferencias(result.raw);",
 "        renderDashboard({docente,preferencias:actual,planInfo:planActual,apdPrefsOnly:true});",
 "        cargarPrefsEnFormulario({preferencias:actual});",
 "      }catch(error){",
 "        if(summary)summary.textContent = 'No pudimos mostrar tus preferencias. Reintentá desde el panel.';",
 "      }",
 "    });"
 ].join("\n"),"only preferences change after readiness");
d(
 [
 "      if (!result.ok) {",
 "        console.error(\"ERROR ALERTAS:\", result.error);"
 ].join("\n"),
 [
 "      if (planActual?.access_active !== true && planActual?.access_active !== false) {",
 "        alertasState.items = []; alertasState.index = 0;",
 "        const panel=document.getElementById('panel-alertas');",
 "        if(panel)panel.textContent='No pudimos verificar tu plan. Reintentá desde el panel.';",
 "        const badge=document.getElementById('alertas-badge');",
 "        if(badge){badge.textContent='';badge.classList.add('hidden');}",
 "        renderEstadisticasPanel(null, ultimoAcceso, true);",
 "        window.__APD_LAB_PERF.finish(apdLabRun, 'plan_unverified');",
 "        return;",
 "      }",
 "      if (!result.ok) {",
 "        console.error(\"ERROR ALERTAS:\", result.error);"
 ].join("\n"),"unknown plan never exposes offers");
d(
 "  const current = () => version === dashboardRequestVersion && obtenerToken() === token;",
 [
 "  const current = () => version === dashboardRequestVersion && obtenerToken() === token;",
 "  // Also prevent the same user seeing previously loaded offers before revalidation.",
 "  alertasState.items=[];alertasState.index=0;",
 "  const previous=document.getElementById('panel-alertas');",
 "  if(previous)previous.textContent='Verificando acceso y alertas...';",
 "  const previousBadge=document.getElementById('alertas-badge');",
 "  if(previousBadge){previousBadge.textContent='';previousBadge.classList.add('hidden');}"
 ].join("\n"),"clear stale offers during plan check");
// This guard exists in the disposable generated dashboard function only.
// It observes actual editor changes and blocks unsafe submit attempts before
// legacy submit listeners can serialize blank/unverified preferences.
d('  mostrarSeccion("panel-docente");',
 [
 "  const oldPrefGuard = window.__APD_LAB_PREF_GUARD;",
 "  const keepDraft = oldPrefGuard?.owner === token && oldPrefGuard.dirty === true;",
 "  oldPrefGuard?.dispose?.();",
 "  const prefForm = document.getElementById('form-preferencias');",
 "  const prefGuard = {owner:token,dirty:keepDraft,revision:oldPrefGuard?.owner===token ? (oldPrefGuard.revision||0) : 0,state:'loading',dispose:()=>{}};",
 "  const onPrefEdit = e => {",
 "    if (!current()) return;",
 "    if (e.target?.matches?.('input, select, textarea')) {prefGuard.dirty = true;prefGuard.revision++;}",
 "  };",
 "  const onPrefClear = e => {",
 "    if (current() && e.target?.closest?.('#btn-clear-distritos, #btn-clear-cargos'))",
 "      {prefGuard.dirty = true;prefGuard.revision++;}",
 "  };",
 "  const onUnsafeSubmit = e => {",
 "    if (!current() || prefGuard.state === 'ready') return;",
 "    e.preventDefault();",
 "    e.stopImmediatePropagation?.();",
 "    showMsg('preferencias-msg', prefGuard.state === 'conflict'",
 "      ? 'Conservamos tus cambios sin guardar. Recargá la página para recuperar las preferencias almacenadas antes de guardar.'",
 "      : 'Esperá a que se verifiquen las preferencias antes de guardar. No se enviaron cambios.', 'error');",
 "  };",
 "  prefForm?.addEventListener('input',onPrefEdit,true);",
 "  prefForm?.addEventListener('change',onPrefEdit,true);",
 "  prefForm?.addEventListener('submit',onUnsafeSubmit,true);",
 "  document.addEventListener?.('click',onPrefClear,true);",
 "  prefGuard.dispose=()=>{",
 "    prefForm?.removeEventListener?.('input',onPrefEdit,true);",
 "    prefForm?.removeEventListener?.('change',onPrefEdit,true);",
 "    prefForm?.removeEventListener?.('submit',onUnsafeSubmit,true);",
 "    document.removeEventListener?.('click',onPrefClear,true);",
 "  };",
 "  window.__APD_LAB_PREF_GUARD=prefGuard;",
 '  mostrarSeccion("panel-docente");'
 ].join("\n"),
 "protect draft edits and unsafely early form submits");
// The late result must never overwrite user-edited controls, even on success.
d(
 [
 "      if(!result.ok){",
 "        if(summary)summary.textContent = 'No pudimos verificar tus preferencias. Reintentá desde el panel.';",
 "        return;",
 "      }",
 "      try{",
 "        const actual=adaptarPreferencias(result.raw);",
 "        renderDashboard({docente,preferencias:actual,planInfo:planActual,apdPrefsOnly:true});",
 "        cargarPrefsEnFormulario({preferencias:actual});",
 "      }catch(error){",
 "        if(summary)summary.textContent = 'No pudimos mostrar tus preferencias. Reintentá desde el panel.';",
 "      }"
 ].join("\n"),
 [
 "      if(!result.ok){",
 "        prefGuard.state='error';",
 "        if(summary)summary.textContent = 'No pudimos verificar tus preferencias. Reintentá desde el panel.';",
 "        return;",
 "      }",
 "      if(prefGuard.dirty){",
 "        prefGuard.state='conflict';",
 "        if(summary)summary.textContent = 'Conservamos tus cambios locales. No se aplicaron las preferencias recibidas del servidor.';",
 "        showMsg('preferencias-msg','Hay cambios sin guardar anteriores a la carga. Recargá la página para recuperar las preferencias almacenadas antes de guardar.','error');",
 "        return;",
 "      }",
 "      prefGuard.state='hydrating';",
 "      try{",
 "        const actual=adaptarPreferencias(result.raw);",
 "        renderDashboard({docente,preferencias:actual,planInfo:planActual,apdPrefsOnly:true});",
 "        cargarPrefsEnFormulario({preferencias:actual});",
 "        prefGuard.state='ready';",
 "      }catch(error){",
 "        prefGuard.state='error';",
 "        if(summary)summary.textContent = 'No pudimos mostrar tus preferencias. Reintentá desde el panel.';",
 "      }"
 ].join("\n"),
 "never clobber an in-progress draft with late server preferences");

renderer=edit(renderer,
 '  setText("panel-bienvenida", nombre ? ',
 '  if (!data.apdPrefsOnly) {\n  setText("panel-bienvenida", nombre ? ',
 "avoid repainting profile on late preferences");
renderer=edit(renderer,
 '  setHTML("panel-preferencias-resumen",',
 '  }\n  setHTML("panel-preferencias-resumen",',
 "end profile-only section");
renderer=edit(renderer,
 '  renderEstadisticasPanel(data.estadisticas?.total_alertas ?? null, data.estadisticas?.ultimo_acceso);',
 '  if(data.apdPrefsOnly)return;\n  renderEstadisticasPanel(data.estadisticas?.total_alertas ?? null, data.estadisticas?.ultimo_acceso);',
 "late preferences do not clear stats/history/alert render");
// Match the actual save lifecycle, not just form hydration. A successful
// server acknowledgement can clear dirty ONLY if no newer editing event occurred
// after the submitted snapshot and the session/guard did not change.
renderer=edit(renderer,
 "async function guardarPreferencias(e) {\n  e.preventDefault();",
 [
 "async function guardarPreferencias(e) {",
 "  e.preventDefault();",
 "  const apdSaveGuard = window.__APD_LAB_PREF_GUARD;",
 "  const apdSaveRevision = apdSaveGuard?.revision;"
 ].join("\n"),
 "capture save-start editor revision");
renderer=edit(renderer,
 '    showMsg("preferencias-msg", data?.message || "Preferencias guardadas", "ok");\n    await cargarDashboard();',
 [
 '    showMsg("preferencias-msg", data?.message || "Preferencias guardadas", "ok");',
 "    if(apdSaveGuard && apdSaveGuard === window.__APD_LAB_PREF_GUARD &&",
 "       apdSaveGuard.owner === token && apdSaveGuard.revision === apdSaveRevision)",
 "      apdSaveGuard.dirty = false;",
 "    await cargarDashboard();"
 ].join("\n"),
 "clear draft after server-confirmed save with revision CAS");

const output="tmp/apd-alerts-performance/app_v2_deferred_preferences_candidate.js";
writeFileSync(output,text.slice(0,start)+dashboard+renderer);
console.log(JSON.stringify({candidate:output,production_untouched:true,
  authenticating:true,plan_gate:"strict true or known inactive",
  preference_hydration_nonblocking:true,remote_telemetry:false,
  deployment:false}));
