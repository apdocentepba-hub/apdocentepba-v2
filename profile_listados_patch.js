(function () {
  "use strict";

  const WORKER_BASE = "https://ancient-wildflower-cd37.apdocentepba.workers.dev";
  const PROFILE_CARD_ID = "panel-perfil-docente";
  const LISTADOS_CARD_ID = "panel-listados-docente";
  const HIST_CARD_ID = "panel-historico-docente";
  const PROFILE_MSG_ID = "perfil-docente-msg";
  const LISTADOS_MSG_ID = "listados-msg";
  const HIST_MSG_ID = "historico-docente-msg";
  const ABC_IMPORT_TYPE = "APD_ABC_LISTADOS";
  const HIST_URL_KEY = "apd_hist_webapp_url";
  const ABC_POPUP_NAME = "apd_abc_import";
  const ABC_POPUP_FEATURES = "popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes";

  let currentEligibility = [];
  let abcPopupRef = null;
  let abcImportRunning = false;
  let histRefreshTimer = null;

  function esc(v) {
    return String(v || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function msg(elId, text, type = "info") {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = String(text || "");
    el.className = `msg msg-${type}`;
  }

  function api(path, options = {}) {
    const token = localStorage.getItem("apd_token_v2") || "";
    const headers = { ...(options.headers || {}) };
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    return fetch(`${WORKER_BASE}${path}`, { ...options, headers }).then(async res => {
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || `HTTP ${res.status}`);
      }
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      return data;
    });
  }

  function currentUserId() {
    return localStorage.getItem("apd_token_v2") || "";
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString("es-AR");
    } catch {
      return String(value);
    }
  }

  function ensureCards() {
    const panel = document.getElementById("panel-content");
    if (!panel) return;

    if (!document.getElementById(PROFILE_CARD_ID)) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<div id="${PROFILE_CARD_ID}" class="panel-card span-4"><div class="card-lbl">🪪 Perfil docente</div><div id="perfil-docente-body"><p class="ph">Cargando...</p></div></div>`
      );
    }

    if (!document.getElementById(LISTADOS_CARD_ID)) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<div id="${LISTADOS_CARD_ID}" class="panel-card span-8"><div class="card-lbl-row"><span class="card-lbl">📚 Mis listados</span><div class="mini-group"><button id="btn-recompute-eligibility" class="mini-btn" type="button">Recalcular compatibilidad</button></div></div><div id="listados-docente-body"><p class="ph">Cargando...</p></div></div>`
      );
    }

    if (!document.getElementById(HIST_CARD_ID)) {
      const listadosCard = document.getElementById(LISTADOS_CARD_ID);
      const html = `<div id="${HIST_CARD_ID}" class="panel-card span-12"><div class="card-lbl-row"><span class="card-lbl">🧭 Mercado APD histórico</span><div class="mini-group"><button id="btn-refresh-historico-docente" class="mini-btn" type="button">Refrescar</button></div></div><div id="historico-docente-body"><p class="ph">Preparando histórico...</p></div></div>`;
      if (listadosCard && listadosCard.nextSibling) listadosCard.insertAdjacentHTML("afterend", html);
      else panel.insertAdjacentHTML("beforeend", html);
    }
  }

  function getHistWebAppUrl() {
    const raw = localStorage.getItem(HIST_URL_KEY) || "";
    return String(raw).trim();
  }

  function setHistWebAppUrl(url) {
    localStorage.setItem(HIST_URL_KEY, String(url || "").trim());
  }

  function getProfileSnapshot() {
    return {
      dni: document.getElementById("perfil-dni")?.value?.trim?.() || "",
      consentimiento: !!document.getElementById("perfil-consentimiento")?.checked
    };
  }

  function buildAbcPopupUrl(dni) {
    const clean = String(dni || "").replace(/\D/g, "");
    const u = new URL("https://abc.gob.ar/listado-oficial");
    if (clean) u.searchParams.set("apd_dni", clean);
    return u.toString();
  }

  function buildAbcBookmarkletHref() {
    const source = `(async()=>{const TYPE='${ABC_IMPORT_TYPE}';const TARGET='*';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();const post=(status,payload,message)=>{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,status,payload,message,source:'abc-bookmarklet'},TARGET);}};const visible=el=>!!el&&el.offsetParent!==null;const allVisible=sel=>[...document.querySelectorAll(sel)].filter(visible);const textOf=el=>norm(el&&(el.innerText||el.textContent||''));function pageRangeText(){const hit=allVisible('body *').find(el=>/Mostrando\\s+\\d+\\s+a\\s+\\d+\\s+de\\s+\\d+\\s+resultados/i.test(textOf(el)));return hit?textOf(hit):'';}function cardCount(){return findCardCandidates().length;}function searchButton(){const buttons=allVisible('button,a,div,span');return buttons.find(el=>/^buscar$/i.test(textOf(el)))||null;}function fieldScore(el){const meta=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');if(/dni|apellido|nombre|buscar/i.test(meta))return 10;return 0;}function searchInput(){const btn=searchButton();if(btn){let root=btn.parentElement;for(let depth=0;depth<5&&root;depth++,root=root.parentElement){const inputs=[...root.querySelectorAll('input')].filter(visible);if(inputs.length){inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0];}}}const inputs=allVisible('input');inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0]||null;}function fireInput(el,value){try{el.focus();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));}catch(e){}}function launchSearch(dni){const input=searchInput();const btn=searchButton();if(input){fireInput(input,dni);}if(btn){btn.click();return true;}if(input){fireInput(input,dni);return true;}return false;}function findCardCandidates(){const els=allVisible('div,article,section,li');const hits=els.filter(el=>{const t=textOf(el);if(!t)return false;if(!/\\b\\d{7,9}\\b/.test(t))return false;if(!/Puntaje:/i.test(t))return false;if(!/Distrito:/i.test(t))return false;if(!/Cargo\\s*Area:/i.test(t))return false;if(t.length<80||t.length>1400)return false;return true;});return hits.filter(el=>!hits.some(other=>other!==el&&el.contains(other)));}function parseCardText(t){const text=String(t||'').replace(/\\u00a0/g,' ');const dni=/\\b(\\d{7,9})\\b/.exec(text)?.[1]||'';const puntaje=/Puntaje:\\s*([0-9.,]+)/i.exec(text)?.[1]||'';const orden=/Orden:\\s*([0-9]+)/i.exec(text)?.[1]||'';const cargo=(/Cargo\\s*Area:\\s*([\\s\\S]*?)(?=\\bApto\\s*F[ií]sico:|\\bDistrito:|\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const distrito=(/Distrito:\\s*([\\s\\S]*?)(?=\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const rama=(/Rama:\\s*([\\s\\S]*?)(?=\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();return{dni:norm(dni),puntaje:norm(puntaje),orden:norm(orden),cargo:norm(cargo),distrito:norm(distrito),rama:norm(rama)};}function scrapeCurrentPage(){const items=[];for(const card of findCardCandidates()){const item=parseCardText(card.innerText);const key=[item.dni,item.cargo,item.puntaje,item.distrito,item.rama,item.orden].join('|');if(item.dni&&item.cargo)items.push({...item,key});}return items;}function nextButton(){const candidates=allVisible('button,a,span,div').filter(el=>textOf(el)==='>');return candidates[candidates.length-1]||null;}async function waitForResults(dni){for(let step=0;step<40;step++){if(pageRangeText()||cardCount())return true;if(step===0||step===6||step===14){launchSearch(dni);}await sleep(500);}return pageRangeText()||cardCount();}async function scrapeRows(){const collected=new Map();for(let turn=0;turn<120;turn++){await sleep(900);const rangeBefore=pageRangeText();const items=scrapeCurrentPage();for(const item of items)collected.set(item.key,item);const next=nextButton();if(!next)break;next.click();let changed=false;for(let i=0;i<16;i++){await sleep(450);const rangeAfter=pageRangeText();if((rangeAfter&&rangeAfter!==rangeBefore)||cardCount()){changed=true;break;}}if(!changed)break;}return[...collected.values()].map(item=>({anio:new Date().getFullYear(),tipo_listado:'OFICIAL',distrito:item.distrito,cargo:item.cargo,materia:item.rama,puntaje:item.puntaje,fuente:'abc_favorito',raw_text:JSON.stringify({source:'abc_favorito',dni:item.dni,orden:item.orden,distrito:item.distrito,rama:item.rama,cargo_area:item.cargo,puntaje:item.puntaje})}));}try{const url=new URL(location.href);const dni=String(url.searchParams.get('apd_dni')||prompt('DNI para importar desde ABC:')||'').replace(/\\D/g,'');if(!dni)throw new Error('Necesitás indicar el DNI.');post('progress',null,'Preparando búsqueda en ABC...');launchSearch(dni);const ok=await waitForResults(dni);if(!ok)throw new Error('Todavía no aparecieron resultados en ABC. Esperá unos segundos y tocá de nuevo el favorito.');post('progress',null,'Leyendo resultados visibles en ABC...');const rows=await scrapeRows();if(!rows.length)throw new Error('No pude leer resultados visibles en ABC.');post('ok',{dni,rows,facets:null,mode:'scrape-dom'},'Listados capturados desde ABC');setTimeout(()=>{try{window.close();}catch(e){}},400);}catch(err){post('error',null,String(err?.message||err));alert(String(err?.message||err));}})();`;
    return `javascript:${encodeURIComponent(source)}`;
  }

  function openAbcPopup(dni) {
    const url = buildAbcPopupUrl(dni);
    abcPopupRef = window.open(url, ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (abcPopupRef) abcPopupRef.focus();
    return abcPopupRef;
  }

  async function saveDniFromUI() {
    const snapshot = getProfileSnapshot();
    if (!snapshot.dni || !snapshot.consentimiento) return false;
    await api("/api/profile/save-dni", {
      method: "POST",
      body: JSON.stringify({ dni: snapshot.dni, consentimiento_datos: snapshot.consentimiento })
    });
    return true;
  }

  function summarizeRows(rows) {
    const safe = Array.isArray(rows) ? rows : [];
    const distritos = [...new Set(safe.map(x => String(x?.distrito || "").trim()).filter(Boolean))].slice(0, 6);
    const cargos = [...new Set(safe.map(x => [x?.cargo, x?.materia].filter(Boolean).join(" · ")).filter(Boolean))].slice(0, 4);
    return { total: safe.length, distritos, cargos };
  }

  async function importRowsFromAbcPayload(payload) {
    if (abcImportRunning) return;
    abcImportRunning = true;
    try {
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const dni = String(payload?.dni || "").replace(/\D/g, "");
      if (!rows.length) throw new Error("ABC no devolvió filas importables.");
      if (dni) {
        const snap = getProfileSnapshot();
        if (snap.consentimiento) {
          document.getElementById("perfil-dni").value = dni;
          await saveDniFromUI().catch(() => null);
        }
      }

      const summary = summarizeRows(rows);
      msg(PROFILE_MSG_ID, `Recibidos ${summary.total} registros desde ABC. Guardando...`, "info");
      await api("/api/listados/import-manual", {
        method: "POST",
        body: JSON.stringify({ rows })
      });
      msg(PROFILE_MSG_ID, `Importados ${summary.total} registros desde ABC. Recalculando compatibilidad...`, "info");
      await refreshPerfilListados();
      await recomputeEligibility(true);
      msg(
        PROFILE_MSG_ID,
        `Listados actualizados desde ABC. Distritos detectados: ${summary.distritos.join(", ") || "—"}`,
        "ok"
      );
    } finally {
      abcImportRunning = false;
    }
  }

  function renderProfile(profileData) {
    const box = document.getElementById("perfil-docente-body");
    if (!box) return;

    const profile = profileData?.profile || null;
    const stats = profileData?.stats || {};
    const syncSummary = profileData?.sync_summary || {};
    const syncStatus = String(profile?.sync_status || "").trim() || "sin_sync";
    const bookmarkletHref = buildAbcBookmarkletHref();

    box.innerHTML = `
      <div class="field">
        <label for="perfil-dni">DNI</label>
        <input id="perfil-dni" type="text" placeholder="Solo números" value="${esc(profile?.dni || "")}" />
      </div>

      <label class="chk-card chk-notif" style="margin-top:10px;">
        <input id="perfil-consentimiento" type="checkbox" ${profile?.consentimiento_datos ? "checked" : ""}/>
        <div>
          <span class="chk-lbl">Autorizo usar mis datos de listados</span>
          <span class="chk-sub">Solo para mejorar alertas, compatibilidad e histórico personal.</span>
        </div>
      </label>

      <div style="margin-top:10px;padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">✅ Importación confiable desde ABC</div>
        <div class="soft-meta">
          No instala extensiones, no pide contraseña y solo lee el listado oficial cuando vos usás tu botón de favoritos.<br>
          Flujo real: <strong>Guardar botón una sola vez</strong> → <strong>Abrir ABC</strong> → <strong>tocar el favorito</strong>.
        </div>
      </div>

      <div class="form-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="btn-save-dni" class="btn btn-primary" type="button">Guardar DNI</button>
        <button id="btn-open-abc" class="btn btn-secondary" type="button">Abrir ABC</button>
        <a id="btn-bookmarklet-abc" class="btn btn-outline" href="${bookmarkletHref}" draggable="true" title="Arrastralo a tu barra de favoritos">Guardar botón en favoritos</a>
      </div>

      <span id="${PROFILE_MSG_ID}" class="msg"></span>

      <div class="soft-meta" style="margin-top:10px;">
        Listados totales: <strong>${Number(stats.listados_total || 0)}</strong><br>
        Importados por ABC/favorito: <strong>${Number(stats.listados_total || 0) - Number(stats.listados_manual || 0) + Number(stats.sync_abc || 0) || Number(stats.listados_total || 0)}</strong> · Manuales: <strong>${Number(stats.listados_manual || 0)}</strong><br>
        Último sync backend: <strong>${esc(formatDate(profile?.last_sync_at))}</strong><br>
        Estado sync backend: <strong>${esc(syncStatus)}</strong>
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">📌 Resumen actual</div>
        <div class="soft-meta">
          Registros detectados: <strong>${Number(syncSummary.total_rows || stats.listados_total || 0)}</strong><br>
          Años: <strong>${esc((syncSummary.anios || []).join(", ") || "—")}</strong><br>
          Distritos: <strong>${esc((syncSummary.distritos || []).slice(0, 6).join(", ") || "—")}</strong>
        </div>
      </div>
    `;

    document.getElementById("btn-save-dni")?.addEventListener("click", async () => {
      msg(PROFILE_MSG_ID, "Guardando...", "info");
      try {
        await saveDniFromUI();
        msg(PROFILE_MSG_ID, "DNI guardado", "ok");
        await refreshPerfilListados();
      } catch (err) {
        msg(PROFILE_MSG_ID, err?.message || "No se pudo guardar el DNI", "error");
      }
    });

    document.getElementById("btn-open-abc")?.addEventListener("click", async () => {
      const snap = getProfileSnapshot();
      if (!snap.dni) {
        msg(PROFILE_MSG_ID, "Primero cargá tu DNI.", "error");
        return;
      }
      if (!snap.consentimiento) {
        msg(PROFILE_MSG_ID, "Para importar desde ABC tenés que aceptar el consentimiento.", "error");
        return;
      }
      msg(PROFILE_MSG_ID, "Guardando DNI y abriendo ABC...", "info");
      try {
        await saveDniFromUI();
        openAbcPopup(snap.dni);
        msg(PROFILE_MSG_ID, "ABC abierto. Cuando veas la página, tocá tu favorito “Traer a APDocentePBA”.", "ok");
      } catch (err) {
        msg(PROFILE_MSG_ID, err?.message || "No se pudo preparar la importación desde ABC", "error");
      }
    });
  }

  function parseRawPayload(rawText) {
    try {
      const parsed = JSON.parse(String(rawText || ""));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return null;
  }

  function renderListados(listados) {
    const box = document.getElementById("listados-docente-body");
    if (!box) return;

    const rows = Array.isArray(listados?.items) ? listados.items : [];
    const summary = listados?.summary || {};
    const visibleRows = rows.slice(0, 40);

    box.innerHTML = `
      <div style="margin-bottom:12px;padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="soft-meta">
          Total: <strong>${Number(summary.total || rows.length)}</strong> ·
          Sync backend: <strong>${Number(summary.sync_abc || 0)}</strong> ·
          Manual / favorito: <strong>${Number(summary.manual || 0)}</strong>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="listado-tipo">Tipo de listado</label>
          <input id="listado-tipo" type="text" placeholder="OFICIAL / 108A / 108B..." />
        </div>
        <div class="field">
          <label for="listado-anio">Año</label>
          <input id="listado-anio" type="number" placeholder="2026" />
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="listado-distrito">Distrito</label>
          <input id="listado-distrito" type="text" placeholder="AVELLANEDA" />
        </div>
        <div class="field">
          <label for="listado-puntaje">Puntaje</label>
          <input id="listado-puntaje" type="text" placeholder="58,42" />
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="listado-cargo">Cargo</label>
          <input id="listado-cargo" type="text" placeholder="PROFESOR" />
        </div>
        <div class="field">
          <label for="listado-materia">Materia</label>
          <input id="listado-materia" type="text" placeholder="MATEMÁTICA" />
        </div>
      </div>

      <div class="form-actions">
        <button id="btn-add-listado-manual" class="btn btn-primary" type="button">Agregar fila manual</button>
      </div>

      <div class="field" style="margin-top:14px;">
        <label for="listado-paste">Pegar listados</label>
        <textarea id="listado-paste" rows="5" placeholder="Una fila por línea. Ejemplo: OFICIAL | MATEMÁTICA | 58,42 | AVELLANEDA"></textarea>
      </div>

      <div class="form-actions">
        <button id="btn-import-paste" class="btn btn-secondary" type="button">Importar texto pegado</button>
      </div>

      <span id="${LISTADOS_MSG_ID}" class="msg"></span>

      <div style="margin-top:14px;">
        ${
          visibleRows.length
            ? `<table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Fuente</th>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Tipo</th>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Cargo / Rama</th>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Distrito / Año</th>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Puntaje</th>
                    <th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  ${visibleRows
                    .map(row => {
                      const raw = parseRawPayload(row.raw_text);
                      const fuenteRaw = String(row.fuente || "").trim();
                      const fuente = fuenteRaw === "abc_public" ? "ABC backend" : (fuenteRaw === "abc_favorito" ? "ABC favorito" : "Manual");
                      const cargoRama = [row.cargo, raw?.rama || row.materia].filter(Boolean).join(" · ");
                      const distritoAnio = [row.distrito, row.anio].filter(Boolean).join(" · ");
                      return `<tr>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(fuente)}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(row.tipo_listado || "")}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(cargoRama)}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(distritoAnio)}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(row.puntaje ?? "")}${raw?.orden != null ? `<br><span class="soft-meta">Orden ${esc(raw.orden)}</span>` : ""}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;"><button class="mini-btn" type="button" data-delete-listado="${esc(row.id)}">Eliminar</button></td>
                      </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
              ${rows.length > visibleRows.length ? `<p class="soft-meta" style="margin-top:8px;">Mostrando ${visibleRows.length} de ${rows.length} registros.</p>` : ""}`
            : `<p class="ph">Todavía no cargaste listados.</p>`
        }
      </div>
    `;

    document.getElementById("btn-add-listado-manual")?.addEventListener("click", async () => {
      const payload = {
        tipo_listado: document.getElementById("listado-tipo")?.value || "",
        anio: document.getElementById("listado-anio")?.value || "",
        distrito: document.getElementById("listado-distrito")?.value || "",
        puntaje: document.getElementById("listado-puntaje")?.value || "",
        cargo: document.getElementById("listado-cargo")?.value || "",
        materia: document.getElementById("listado-materia")?.value || ""
      };
      msg(LISTADOS_MSG_ID, "Guardando...", "info");
      try {
        await api("/api/listados/import-manual", { method: "POST", body: JSON.stringify(payload) });
        msg(LISTADOS_MSG_ID, "Fila agregada", "ok");
        await refreshPerfilListados();
      } catch (err) {
        msg(LISTADOS_MSG_ID, err?.message || "No se pudo guardar la fila", "error");
      }
    });

    document.getElementById("btn-import-paste")?.addEventListener("click", async () => {
      const payload = {
        raw_text: document.getElementById("listado-paste")?.value || "",
        tipo_listado: document.getElementById("listado-tipo")?.value || "",
        anio: document.getElementById("listado-anio")?.value || "",
        distrito: document.getElementById("listado-distrito")?.value || ""
      };
      msg(LISTADOS_MSG_ID, "Importando...", "info");
      try {
        await api("/api/listados/import-paste", { method: "POST", body: JSON.stringify(payload) });
        msg(LISTADOS_MSG_ID, "Texto importado", "ok");
        await refreshPerfilListados();
      } catch (err) {
        msg(LISTADOS_MSG_ID, err?.message || "No se pudo importar el texto", "error");
      }
    });

    box.querySelectorAll("[data-delete-listado]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-listado");
        if (!id) return;
        msg(LISTADOS_MSG_ID, "Eliminando...", "info");
        try {
          await api("/api/listados/delete", { method: "POST", body: JSON.stringify({ id }) });
          msg(LISTADOS_MSG_ID, "Listado eliminado", "ok");
          await refreshPerfilListados();
        } catch (err) {
          msg(LISTADOS_MSG_ID, err?.message || "No se pudo eliminar", "error");
        }
      });
    });

    document.getElementById("btn-recompute-eligibility")?.addEventListener("click", () => recomputeEligibility(false));
  }

  function getCurrentOffersFromPanel() {
    try {
      if (Array.isArray(window.alertasState?.items)) return window.alertasState.items;
    } catch {}
    return [];
  }

  function eligibilityBadgeHtml(item) {
    if (!item || !item.offer_id) return "";
    const cls = item.compatible ? "plan-pill" : "plan-pill plan-pill-neutral";
    return `<div style="margin-top:8px;"><span class="${cls}">${item.compatible ? "Compatible" : "Sin match"}</span>${item.puntaje_usuario != null ? `<span class="plan-pill">Puntaje ${esc(Number(item.puntaje_usuario).toFixed(2))}</span>` : ""}${item.confidence_level ? `<span class="plan-pill plan-pill-neutral">${esc(item.confidence_level)}</span>` : ""}</div>${item.strategic_message ? `<p class="plan-note" style="margin-top:6px;">${esc(item.strategic_message)}</p>` : ""}`;
  }

  function mountEligibilityIntoAlertPanel() {
    const panel = document.getElementById("panel-alertas");
    if (!panel || !currentEligibility.length) return;
    const currentOffer = getCurrentOffersFromPanel()[window.alertasState?.index || 0];
    if (!currentOffer) return;
    const offerId = String(currentOffer.offer_id || currentOffer.source_offer_key || currentOffer.idoferta || currentOffer.iddetalle || "").trim();
    if (!offerId) return;
    const info = currentEligibility.find(item => String(item.offer_id || "").trim() === offerId);
    if (!info || document.getElementById("eligibility-current-offer")) return;
    panel.insertAdjacentHTML("beforeend", `<div id="eligibility-current-offer" style="margin-top:12px;padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;"><div class="card-lbl">🎯 Tus chances en APD</div>${eligibilityBadgeHtml(info)}</div>`);
  }

  async function recomputeEligibility(silent) {
    const offers = getCurrentOffersFromPanel();
    if (!silent) msg(LISTADOS_MSG_ID, "Calculando compatibilidad...", "info");
    try {
      const data = await api("/api/eligibility/recompute", { method: "POST", body: JSON.stringify({ offers }) });
      currentEligibility = Array.isArray(data?.items) ? data.items : [];
      if (!silent) msg(LISTADOS_MSG_ID, `Compatibilidades calculadas: ${Number(data?.summary?.compatibles || 0)} compatibles`, "ok");
      document.getElementById("eligibility-current-offer")?.remove();
      mountEligibilityIntoAlertPanel();
    } catch (err) {
      if (!silent) msg(LISTADOS_MSG_ID, err?.message || "No se pudo recalcular compatibilidad", "error");
    }
  }

  async function fetchHistoricoData() {
    const base = getHistWebAppUrl();
    const userId = currentUserId();
    if (!base || !userId) return null;
    const url = new URL(base);
    url.searchParams.set("action", "overview");
    url.searchParams.set("days", "30");
    const res = await fetch(url.toString());
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("El histórico no devolvió JSON válido.");
    }
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `Histórico ${res.status}`);
    return data;
  }

  function renderHistoricoCard(data) {
    const box = document.getElementById("historico-docente-body");
    if (!box) return;
    const histUrl = getHistWebAppUrl();

    if (!histUrl) {
      box.innerHTML = `
        <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
          <div class="soft-meta" style="margin-bottom:10px;">Dejá conectado el histórico real en Apps Script y este bloque va a mostrar movimiento provincial, tendencias útiles y lectura estratégica.</div>
          <div class="field">
            <label for="hist-webapp-url">URL del Web App histórico</label>
            <input id="hist-webapp-url" type="text" placeholder="Pegá acá la URL desplegada del Apps Script" value="" />
          </div>
          <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <button id="btn-save-hist-url" class="btn btn-secondary" type="button">Guardar URL</button>
          </div>
          <span id="${HIST_MSG_ID}" class="msg"></span>
        </div>`;
      document.getElementById("btn-save-hist-url")?.addEventListener("click", () => {
        const value = document.getElementById("hist-webapp-url")?.value || "";
        if (!value.trim()) {
          msg(HIST_MSG_ID, "Pegá primero la URL del Web App histórico.", "error");
          return;
        }
        setHistWebAppUrl(value);
        msg(HIST_MSG_ID, "URL guardada. Refrescá el histórico.", "ok");
        refreshHistoricoCard().catch(() => null);
      });
      return;
    }

    if (!data) {
      box.innerHTML = `<p class="ph">Esperando datos del histórico...</p>`;
      return;
    }

    const topDistritos = Array.isArray(data?.top_distritos) ? data.top_distritos.slice(0, 5) : [];
    const topCargos = Array.isArray(data?.top_cargos) ? data.top_cargos.slice(0, 5) : [];
    const latest = Array.isArray(data?.latest_rows) ? data.latest_rows.slice(0, 5) : [];

    box.innerHTML = `
      <div class="stats-grid" style="margin-bottom:14px;">
        <div class="stat-box"><span class="stat-n">${esc(data?.total_ofertas ?? "-")}</span><span class="stat-l">Radar 30d</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.activas_estimadas ?? "-")}</span><span class="stat-l">Activas</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.nuevas_7d ?? "-")}</span><span class="stat-l">Nuevas 7d</span></div>
        <div class="stat-box"><span class="stat-n">${esc(data?.state_breakdown?.desiertas ?? "-")}</span><span class="stat-l">Desiertas</span></div>
      </div>
      ${data?.coverage_hint ? `<p class="prefs-hint" style="margin-bottom:14px;">${esc(data.coverage_hint)}</p>` : ""}
      <div class="radar-columns">
        <div class="radar-box">
          <h4>Distritos con más movimiento</h4>
          ${topDistritos.length ? `<ul class="historico-list">${topDistritos.map(item => `<li class="historico-item"><span>${esc(item.label || item.distrito || "-")}</span><strong class="historico-count">${esc(item.value ?? "-")}</strong></li>`).join("")}</ul>` : `<p class="ph">Sin ranking distrital todavía.</p>`}
        </div>
        <div class="radar-box">
          <h4>Materias / cargos con más salida</h4>
          ${topCargos.length ? `<ul class="historico-list">${topCargos.map(item => `<li class="historico-item"><span>${esc(item.label || item.cargo || "-")}</span><strong class="historico-count">${esc(item.value ?? "-")}</strong></li>`).join("")}</ul>` : `<p class="ph">Sin ranking de cargos todavía.</p>`}
        </div>
      </div>
      <div class="historico-box historico-box-latest" style="margin-top:14px;">
        <h4>Último movimiento provincial</h4>
        ${latest.length ? `<ul class="soft-list">${latest.map(row => `<li class="soft-item"><div class="soft-title">${esc([row.cargo, row.area].filter(Boolean).join(" · ") || row.cargo || "Oferta APD")}</div><div class="soft-sub">${esc(row.escuela || "Sin escuela")} · ${esc(row.distrito || "-")}</div><div class="soft-meta">Estado: ${esc(row.estado || "-")} · Turno: ${esc(row.turno || "-")} · Vista: ${esc(formatDate(row.last_seen_at || row.ingested_at || "-"))}</div></li>`).join("")}</ul>` : `<p class="ph">Sin movimiento reciente todavía.</p>`}
      </div>
      <span id="${HIST_MSG_ID}" class="msg"></span>
    `;
  }

  async function refreshHistoricoCard() {
    clearTimeout(histRefreshTimer);
    const box = document.getElementById("historico-docente-body");
    if (box) box.innerHTML = `<p class="ph">Leyendo histórico...</p>`;
    try {
      const data = await fetchHistoricoData();
      renderHistoricoCard(data);
    } catch (err) {
      renderHistoricoCard(null);
      msg(HIST_MSG_ID, err?.message || "No se pudo leer el histórico.", "error");
    }
  }

  async function refreshPerfilListados() {
    ensureCards();
    const [profile, listados] = await Promise.all([api("/api/profile/me"), api("/api/listados/mis-listados")]);
    renderProfile(profile);
    renderListados(listados);
    renderHistoricoCard(null);
    histRefreshTimer = setTimeout(() => {
      refreshHistoricoCard().catch(() => null);
    }, 50);
  }

  function hookAlertRender() {
    if (window.__perfilDocenteAlertHook) return;
    window.__perfilDocenteAlertHook = true;
    const original = window.renderAlertasAPD;
    if (typeof original === "function") {
      window.renderAlertasAPD = function patchedRenderAlertasAPD(alertas) {
        const result = original(alertas);
        setTimeout(() => {
          document.getElementById("eligibility-current-offer")?.remove();
          mountEligibilityIntoAlertPanel();
        }, 50);
        return result;
      };
    }
  }

  async function handleAbcImportMessage(event) {
    if (!event || !event.data || event.data.type !== ABC_IMPORT_TYPE) return;
    if (!String(event.origin || "").includes("abc.gob.ar")) return;
    if (event.data.status === "progress") {
      msg(PROFILE_MSG_ID, event.data.message || "Leyendo resultados en ABC...", "info");
      return;
    }
    if (event.data.status === "error") {
      msg(PROFILE_MSG_ID, event.data.message || "No se pudo importar desde ABC.", "error");
      return;
    }
    try {
      await importRowsFromAbcPayload(event.data.payload || {});
    } catch (err) {
      msg(PROFILE_MSG_ID, err?.message || "No se pudo guardar la importación desde ABC.", "error");
    }
  }

  function bindGlobalListeners() {
    if (!window.__apdAbcImportListenerBound) {
      window.__apdAbcImportListenerBound = true;
      window.addEventListener("message", event => {
        handleAbcImportMessage(event).catch(() => null);
      });
    }

    document.getElementById("btn-refresh-historico-docente")?.addEventListener("click", () => {
      refreshHistoricoCard().catch(() => null);
    });
  }

  function bootWhenPanelExists() {
    ensureCards();
    hookAlertRender();
    bindGlobalListeners();
    refreshPerfilListados().catch(() => {});
  }

  const observer = new MutationObserver(() => {
    const panel = document.getElementById("panel-content");
    if (panel && !document.getElementById(PROFILE_CARD_ID)) bootWhenPanelExists();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      bootWhenPanelExists();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    bootWhenPanelExists();
  }
})();
