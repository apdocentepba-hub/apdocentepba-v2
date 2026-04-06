/*
REEMPLAZO MANUAL PARA app_v2.js

Reemplazar la función completa `cargarDashboard()` por esta versión.
Objetivo: renderizar el panel antes y ejecutar `sync-offers` en segundo plano,
sin bloquear la carga visual inicial.
*/

async function cargarDashboard() {
  const token = obtenerToken();

  if (!token) {
    actualizarNav();
    mostrarSeccion("inicio");
    return;
  }

  mostrarSeccion("panel-docente");
  setPanelLoading(true);

  try {
    const [docente, prefRaw, planInfo, alertasResult] = await Promise.all([
      obtenerDocentePorId(token),
      obtenerPreferenciasPorUserId(token),
      obtenerMiPlan(token),
      obtenerMisAlertas(token).catch(err => {
        console.error("ERROR ALERTAS:", err);
        return [];
      })
    ]);

    if (!docente) {
      alert("Usuario no encontrado en Supabase");
      logout();
      return;
    }

    const preferencias = adaptarPreferencias(prefRaw);
    planActual = planInfo || buildPlanFallback();
    const alertasPanel = Array.isArray(alertasResult)
      ? alertasResult
      : [];

    console.log("ALERTAS PANEL:", alertasPanel.length, alertasPanel);

    renderDashboard({
      docente,
      preferencias,
      alertas: alertasPanel,
      historial: [],
      planInfo: planActual,
      estadisticas: {
        total_alertas: Array.isArray(alertasResult) ? alertasResult.length : 0,
        alertas_leidas: 0,
        alertas_no_leidas: Array.isArray(alertasResult) ? alertasResult.length : 0,
        ultimo_acceso: docente.ultimo_login || new Date().toISOString()
      }
    });

    workerFetchJson('/api/sync-offers', {
      method: 'POST',
      body: JSON.stringify({
        offers: alertasPanel.map(o => ({
          ...o,
          id: String(o.idoferta || o.iddetalle || o.id || ""),
          offer_id: String(o.idoferta || o.iddetalle || o.id || ""),
          cargo: o.cargo || o.descripcioncargo || "",
          materia: o.materia || o.area || o.descripcionarea || "",
          nivel: o.nivel || o.nivel_modalidad || o.descnivelmodalidad || "",
          distrito: o.distrito || o.descdistrito || "",
          escuela: o.escuela || o.nombreestablecimiento || "",
          turno: o.turno || "",
          modulos: o.modulos || o.hsmodulos || "",
          dias_horarios: o.dias_horarios || [
            o.lunes, o.martes, o.miercoles, o.jueves, o.viernes, o.sabado
          ].filter(Boolean).join(" "),
          desde: o.desde || o.supl_desde_label || o.supl_desde || "",
          hasta: o.hasta || o.supl_hasta_label || o.supl_hasta || "",
          tipo_cargo: o.tipo_cargo || o.tipooferta || "",
          revista: o.revista || o.supl_revista || "",
          curso_division: o.curso_division || o.cursodivision || "",
          jornada: o.jornada || "",
          observaciones: o.observaciones || "",
          fecha_cierre: o.fecha_cierre || o.fecha_cierre_fmt || o.finoferta_label || o.finoferta || "",
          link_postular: o.link_postular || o.abc_postulantes_url || "",
          source_offer_key: o.source_offer_key || "",
          total_postulantes: o.total_postulantes ?? null,
          puntaje_primero: o.puntaje_primero ?? null,
          listado_origen_primero: o.listado_origen_primero || ""
        }))
      })
    }).catch(err => {
      console.warn('ERROR SYNC OFFERS:', err);
    });

    cargarPrefsEnFormulario({ preferencias });
    renderPlanUI(planActual);
    actualizarNav();

    if (typeof window.cargarExtrasProvincia === "function") {
      window.cargarExtrasProvincia().catch(err => {
        console.error("ERROR EXTRAS PROVINCIA:", err);
      });
    }

    await adminCheckAccess();
    bindAdminEvents();
  } catch (err) {
    console.error("ERROR CARGANDO PANEL:", err);
    alert("Error cargando panel");
    logout();
  } finally {
    setPanelLoading(false);
  }
}
