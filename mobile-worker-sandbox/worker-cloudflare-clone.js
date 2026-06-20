// APDocentePBA Mobile Worker Sandbox
//
// Pegá acá el Worker de Cloudflare completo, tal cual está funcionando hoy.
// Este archivo vive en la rama mobile-worker-sandbox y NO está conectado a producción.
//
// No modificar rutas productivas desde este archivo.
// No usar este archivo para deploy automático.
// No reemplazar el Worker actual con este archivo.

export default {
  async fetch(request, env, ctx) {
    return new Response(JSON.stringify({
      ok: true,
      sandbox: true,
      message: "Pegá acá el Worker real de Cloudflare para crear la versión móvil aislada."
    }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
