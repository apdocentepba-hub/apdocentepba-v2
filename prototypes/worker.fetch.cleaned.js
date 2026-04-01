export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // ===============================
      // TESTS Y UTILIDADES
      // ===============================
      if (path === "/test-mail" && request.method === "GET") {
        const r = await enviarMailBrevo(
          "martin.nicolas.podubinio@gmail.com",
          "Martin",
          "PRUEBA APDocentePBA 🚀",
          "<h1>Funciona desde Worker</h1>",
          env
        );

        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }

      if (path === "/test-email-sweep" && request.method === "GET") {
        const r = await runEmailAlertsSweep(env, { source: "manual_test" });
        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }

      if (path === "/test-digest" && request.method === "GET") {
        const r = await sendPendingEmailDigests(env);
        return new Response(JSON.stringify(r, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }

      if (path === `${API_URL_PREFIX}/test-db` && request.method === "GET") {
        return json({ ok: true, version: API_VERSION });
      }

      // ===============================
      // AUTH
      // ===============================
      if (path === `${API_URL_PREFIX}/login` && request.method === "POST") {
        return await handleLogin(request, env);
      }

      if (path === `${API_URL_PREFIX}/register` && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return await handleRegister(body, env);
      }

      if (path === `${API_URL_PREFIX}/google-auth` && request.method === "POST") {
        return await handleGoogleAuth(request, env);
      }

      // ===============================
      // PLANES Y PREFERENCIAS
      // ===============================
      if (path === `${API_URL_PREFIX}/planes` && request.method === "GET") {
        return await handlePlanes(env);
      }

      if (path === `${API_URL_PREFIX}/mi-plan` && request.method === "GET") {
        return await handleMiPlan(url, env);
      }

      if (path === `${API_URL_PREFIX}/guardar-preferencias` && request.method === "POST") {
        return await handleGuardarPreferencias(request, env);
      }

      // ===============================
      // ALERTAS USUARIO
      // ===============================
      if (path === `${API_URL_PREFIX}/mis-alertas` && request.method === "GET") {
        return await handleMisAlertas(url, env);
      }

      if (path === "/api/sync-offers" && request.method === "POST") {
        const user = await getSessionUserByBearer(env, request);

        if (!user) {
          return jsonResponse({ ok: false, error: "No autenticado" }, 401);
        }

        const body = await request.json().catch(() => ({}));
        const offers = Array.isArray(body?.offers) ? body.offers : [];
        const syncResult = await syncUserOfferState(env, user.id, offers);

        return jsonResponse({
          ok: true,
          synced: offers.length,
          sync_result: syncResult
        });
      }

      if (path === `${API_URL_PREFIX}/postulantes-resumen` && request.method === "GET") {
        return await handlePostulantesResumen(url);
      }

      // ===============================
      // HISTORICO USUARIO
      // ===============================
      if (path === `${API_URL_PREFIX}/capturar-historico-apd` && request.method === "POST") {
        return await handleCapturarHistoricoAPD(request, env);
      }

      if (path === `${API_URL_PREFIX}/historico-resumen` && request.method === "GET") {
        return await handleHistoricoResumen(url, env);
      }

      // ===============================
      // PROVINCIA
      // ===============================
      if (path === `${API_URL_PREFIX}/provincia/backfill-status` && request.method === "GET") {
        return await handleProvinciaBackfillStatus(env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-step` && request.method === "POST") {
        return await handleProvinciaBackfillStep(request, env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-reset` && request.method === "POST") {
        return await handleProvinciaBackfillReset(env);
      }

      if (path === `${API_URL_PREFIX}/provincia/backfill-kick` && request.method === "POST") {
        return await handleProvinciaBackfillKick(request, env, ctx);
      }

      if (path === `${API_URL_PREFIX}/provincia/resumen` && request.method === "GET") {
        return await handleProvinciaResumen(url, env);
      }

      if (path === `${API_URL_PREFIX}/provincia/insights` && request.method === "GET") {
        return await handleProvinciaInsights(url, env);
      }

      // ===============================
      // MERCADO PAGO
      // ===============================
      if (path === `${API_URL_PREFIX}/mercadopago/create-checkout-link` && request.method === "POST") {
        return await handleMercadoPagoCreateCheckoutLink(request, env);
      }

      if (path === `${API_URL_PREFIX}/mercadopago/webhook` && request.method === "POST") {
        return await handleMercadoPagoWebhook(request, env);
      }

      // ===============================
      // WHATSAPP
      // ===============================
      if (path === `${API_URL_PREFIX}/whatsapp/health` && request.method === "GET") {
        return await handleWhatsAppHealth(env);
      }

      if (path === `${API_URL_PREFIX}/whatsapp/test-send` && request.method === "POST") {
        return await handleWhatsAppTestSend(request, env);
      }

      // ===============================
      // CATALOGOS
      // ===============================
      if (path === `${API_URL_PREFIX}/importar-catalogo-cargos` && request.method === "GET") {
        return await handleImportarCatalogoCargos(url, env);
      }

      // ===============================
      // ADMIN
      // ===============================
      if (path === `${API_URL_PREFIX}/admin/me` && request.method === "GET") {
        return await handleAdminMe(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/resumen` && request.method === "GET") {
        return await handleAdminResumen(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/usuarios` && request.method === "GET") {
        return await handleAdminUsuarios(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/sesiones` && request.method === "GET") {
        return await handleAdminSesiones(request, env);
      }

      if (path === `${API_URL_PREFIX}/admin/alertas` && request.method === "GET") {
        return await handleAdminAlertas(request, env);
      }

      return json({ ok: false, error: "Ruta no encontrada" }, 404);
    } catch (err) {
      return json({ ok: false, error: err?.message || "Error interno" }, 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runProvinciaBackfillStep(env, { source: "cron", force: false }).catch(err => {
        console.error("PROVINCIA BACKFILL CRON STEP ERROR:", err);
      })
    );
    ctx.waitUntil(runWhatsAppAlertsSweep(env, { source: "cron" }));
    ctx.waitUntil(runEmailAlertsSweep(env, { source: "cron" }));
    ctx.waitUntil(sendPendingEmailDigests(env));
  }
};
