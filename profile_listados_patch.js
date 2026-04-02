(function () {
  "use strict";

  const PROFILE_CARD_ID = "panel-perfil-docente";
  const LISTADOS_CARD_ID = "panel-listados-docente";
  const PROFILE_MSG_ID = "perfil-docente-msg";
  const LISTADOS_MSG_ID = "listados-msg";
  let currentEligibility = [];

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
    const headers = { ...(options.headers || {}), Authorization: token ? `Bearer ${token}` : "" };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    return fetch(`https://ancient-wildflower-cd37.apdocentepba.workers.dev${path}`, { ...options, headers }).then(async res => {
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      return data;
    });
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

  function renderProfile(profileData) {
    const box = document.getElementById("perfil-docente-body");
    if (!box) return;

    const profile = profileData?.profile || null;
    const stats = profileData?.stats || {};
    const syncSummary = profileData?.sync_summary || {};
    const syncStatus = String(profile?.sync_status || "").trim() || "sin_sync";

    box.innerHTML = `
      <div class="field">
        <label for="perfil-dni">DNI</label>
        <input id="perfil-dni" type="text" placeholder="Solo números" value="${esc(profile?.dni || "")}" />
      </div>

      <label class="chk-card chk-notif" style="margin-top:10px;">
        <input id="perfil-consentimiento" type="checkbox" ${profile?.consentimiento_datos ? "checked" : ""}/>
        <div>
          <span class="chk-lbl">Autorizo usar mis datos de listados</span>
          <span class="chk-sub">Solo para mejorar mis alertas y compatibilidad.</span>
        </div>
      </label>

      <div class="form-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btn-save-dni" class="btn btn-primary" type="button">Guardar DNI</button>
        <button id="btn-sync-abc" class="btn btn-secondary" type="button">Sincronizar desde ABC</button>
      </div>

      <span id="${PROFILE_MSG_ID}" class="msg"></span>

      <div class="soft-meta" style="margin-top:10px;">
        Listados totales: <strong>${Number(stats.listados_total || 0)}</strong><br>
        Sync ABC: <strong>${Number(stats.listados_sync_abc || 0)}</strong> · Manuales: <strong>${Number(stats.listados_manual || 0)}</strong><br>
        Último sync: <strong>${esc(formatDate(profile?.last_sync_at))}</strong><br>
        Estado sync: <strong>${esc(syncStatus)}</strong>
      </div>

      <div style="margin-top:10px;padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">📌 Resumen del sync ABC</div>
        <div class="soft-meta">
          Registros: <strong>${Number(syncSummary.total_rows || 0)}</strong><br>
          Años: <strong>${esc((syncSummary.anios || []).join(", ") || "—")}</strong><br>
          Distritos: <strong>${esc((syncSummary.distritos || []).slice(0, 6).join(", ") || "—")}</strong>
        </div>
      </div>
    `;

    document.getElementById("btn-save-dni")?.addEventListener("click", async () => {
      const dni = document.getElementById("perfil-dni")?.value || "";
      const consentimiento = !!document.getElementById("perfil-consentimiento")?.checked;
      msg(PROFILE_MSG_ID, "Guardando...", "info");
      try {
        await api("/api/profile/save-dni", {
          method: "POST",
          body: JSON.stringify({ dni, consentimiento_datos: consentimiento })
        });
        msg(PROFILE_MSG_ID, "DNI guardado", "ok");
        await refreshPerfilListados();
      } catch (err) {
        msg(PROFILE_MSG_ID, err?.message || "No se pudo guardar el DNI", "error");
      }
    });

    document.getElementById("btn-sync-abc")?.addEventListener("click", async () => {
      msg(PROFILE_MSG_ID, "Sincronizando desde ABC...", "info");
      try {
        const data = await api("/api/listados/sync-public-abc", {
          method: "POST",
          body: JSON.stringify({})
        });
        msg(
          PROFILE_MSG_ID,
          data?.message || `Sincronización completada. Registros: ${Number(data?.imported || 0)}`,
          "ok"
        );
        await refreshPerfilListados();
        try {
          await recomputeEligibility(true);
        } catch {}
      } catch (err) {
        msg(PROFILE_MSG_ID, err?.message || "No se pudo sincronizar con ABC", "error");
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
          ABC: <strong>${Number(summary.sync_abc || 0)}</strong> ·
          Manual: <strong>${Number(summary.manual || 0)}</strong>
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
                      const fuente = String(row.fuente || "").trim() === "abc_public" ? "ABC" : "Manual";
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
              ${
                rows.length > visibleRows.length
                  ? `<p class="soft-meta" style="margin-top:8px;">Mostrando ${visibleRows.length} de ${rows.length} registros.</p>`
                  : ""
              }`
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
      if (!silent) {
        msg(LISTADOS_MSG_ID, `Compatibilidades calculadas: ${Number(data?.summary?.compatibles || 0)} compatibles`, "ok");
      }
      document.getElementById("eligibility-current-offer")?.remove();
      mountEligibilityIntoAlertPanel();
    } catch (err) {
      if (!silent) msg(LISTADOS_MSG_ID, err?.message || "No se pudo recalcular compatibilidad", "error");
    }
  }

  async function refreshPerfilListados() {
    ensureCards();
    const [profile, listados] = await Promise.all([api("/api/profile/me"), api("/api/listados/mis-listados")]);
    renderProfile(profile);
    renderListados(listados);
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

  function bootWhenPanelExists() {
    ensureCards();
    hookAlertRender();
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
