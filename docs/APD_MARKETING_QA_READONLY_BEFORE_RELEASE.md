# APDocente — QA antes de publicar backend comercial

## Qué se valida

Una nueva ruta interna, sin envíos de publicidad, que permite consultar el estado de marketing propio y registrar una baja. **El sitio y el Worker productivo NO deben cambiar durante la prueba**. URL de prueba:

\`https://apd-marketing-safe-ancient-wildflower-cd37.apdocentepba.workers.dev\`

GitHub Actions ya comprueba rutas sin credenciales y evita modificar el tráfico. Falta el GET real con la sesión del dueño. Hacé la prueba en tu navegador estando ya identificado en https://alertasapd.com.ar/.

### Consola del navegador: prueba solo lectura

Abrir F12 > Consola y ejecutar el siguiente código. **No copiar tokens, emails ni el contenido de las respuestas en mensajes o tickets.** Solo compartir la tabla de resultados PASS/FAIL.

\`\`\`js
(async () => {
  const base = 'https://apd-marketing-safe-ancient-wildflower-cd37.apdocentepba.workers.dev';
  const token = String(
    (typeof window.obtenerAuthBearer === 'function' && window.obtenerAuthBearer()) ||
    (typeof window.obtenerSessionToken === 'function' && window.obtenerSessionToken()) ||
    localStorage.getItem('apd_session_token_v1') || ''
  ).trim();
  if (!token) { console.warn('Primero iniciá sesión en APDocente'); return; }

  const read = async (url, headers = {}) => {
    const r = await fetch(url, { method: 'GET', headers, cache:'no-store' });
    return { status:r.status, body:await r.json().catch(()=>null) };
  };
  const route=base+'/api/account/marketing-preferences';
  const [self, injected, anonymous]=await Promise.all([
    read(route, {Authorization:'Bearer '+token}),
    read(route+'?user_id=11111111-1111-4111-8111-111111111111', {Authorization:'Bearer '+token}),
    read(route)
  ]);
  const hasSafeState = data => data?.ok===true &&
    ['not_requested','pending_confirmation','subscribed','unsubscribed']
      .includes(data.marketing?.status);
  const checks=[
    ['Solo la propia sesión accede',self.status===200 && hasSafeState(self.body),self.status],
    ['No acepta suplantación por URL',
     injected.status===200 && hasSafeState(injected.body) &&
     JSON.stringify(injected.body?.marketing)===JSON.stringify(self.body?.marketing),
     injected.status],
    ['Sin sesión es rechazado',anonymous.status===401,anonymous.status],
    ['Nunca habilita campañas por defecto',
     self.body?.marketing?.eligible_for_campaign!==true, self.status]
  ];
  console.table(checks.map(([prueba,ok,http])=>({prueba,passed:ok,http})));
  console.log('Resumen:',checks.every(row=>row[1])?'4/4 OK':'REVISAR - NO PUBLICAR');
})();
\`\`\`

Este script no imprime el token ni datos de usuarios y no ejecuta ninguna operación de escritura. No prueba el botón de baja real.

## Requisitos de salida a producción

- CI de rama backend verde: generación, sesión mock, bloqueos de Brevo, Cloudflare con 0% de tráfico, bindings+KV.
- Prueba real con consola 4/4 OK sobre la URL de vista previa de **esta** versión.
- Workflow manual de GitHub \`Release marketing preferences backend (manual and gated)\` sobre \`main\`, con los dos controles \`RELEASE\` y \`VERIFIED\`, solo después del QA.
- Tras publicación, repetir el smoke GET 401/405/200 sin transferir credenciales, y revisar el estado de las cuatro tareas cron.
- La interfaz de «Mi cuenta» debe publicarse **después** de la API.
- La baja local del servidor no sincroniza por sí sola las bajas existentes en Brevo. **No iniciar campañas hasta validar la sincronización/opt-out del proveedor y la lista de marketing.**
- La ruta \`request_confirmation\` solo registra una solicitud y **no envía correo de doble confirmación**.
- **No reutilizar** el flujo manual viejo de preferencias autenticadas. Usar únicamente el flujo nuevo de marketing, que preserva capturas, vinculaciones, cron y rollback.
