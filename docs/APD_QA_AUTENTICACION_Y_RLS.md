# APDocente — QA autenticada y cierre RLS

## Estado
La vista previa actual del backend se genera en el [PR #132](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/132). **No usar el preview del PR #131 para la aceptación del backend definitivo.**

Pruebas automatizadas del Worker candidato completadas en CI con Supabase simulado. Cloudflare tiene una vista previa sin tráfico de producción. No hay aprobación aún de sesión real ni despliegue.

## Prueba real necesaria (sin compartir credenciales)
1. El titular ingresa a https://alertasapd.com.ar con una cuenta de prueba autorizada.
2. En esa misma sesión abre la consola del navegador, examina y ejecuta el bloque siguiente. No imprime el token ni modifica la base de datos.
3. Todos los valores `passed` deben ser true. Informar solo dichos booleanos y códigos HTTP, nunca datos personales ni tokens.

```javascript
(async () => {
  const session = localStorage.getItem('apd_session_token_v1');
  const expectedId = localStorage.getItem('apd_token_v2');
  if (!session || !expectedId) { console.error('No hay sesión iniciada'); return; }
  const base = 'https://apd-auth-backend-ancient-wildflower-cd37.apdocentepba.workers.dev';
  const get = async (path, authenticated = true) => {
    const headers = authenticated ? { Authorization: 'Bearer ' + session } : {};
    const r = await fetch(base + path, { headers, cache: 'no-store' });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const profile = await get('/api/account/profile');
  const prefs = await get('/api/account/preferences');
  const impersonation = await get('/api/account/preferences?user_id=00000000-0000-4000-8000-000000000000');
  const anonymous = await get('/api/account/preferences', false);
  console.table({
    profile: { passed: profile.status === 200 && profile.data?.user?.id === expectedId, status: profile.status },
    preferences: { passed: prefs.status === 200 && (!prefs.data?.preferences || prefs.data.preferences.user_id === expectedId), status: prefs.status },
    rejectsOtherId: { passed: impersonation.status === 200 && (!impersonation.data?.preferences || impersonation.data.preferences.user_id === expectedId), status: impersonation.status },
    rejectsAnonymous: { passed: anonymous.status === 401, status: anonymous.status },
  });
})().catch(error => console.error('Prueba fallida: ' + error.message));
```

## Orden estricto para publicar
1. Verificar workflows actuales, versión real de Cloudflare y paridad de bindings y KV. Si cambió el snapshot canónico, detener el despliegue.
2. Revisión del login real por contraseña y Google; perfil y preferencias; verificar ID de sesión propio y no de otro usuario.
3. Desplegar SOLO Worker mediante flujo protegido con rollback; validar rutas antes y después, incluyendo planes, pagos y envío de alertas.
4. Recién después publicar app_v2.js e index.html con ?v=18, para romper caché. Probar sesión antigua/nueva, panel y preferencias.
5. Monitorear requests antiguos del navegador, posibles errores de permisos, cuentas Insigne autorizadas y cron de envíos.
6. Una vez estable, ejecutar de forma controlada docs/sql/APD_SECURITY_PHASE2_ONLY_AFTER_STAGING.sql para quitar SELECT de anon/authenticated y activar RLS en users y user_preferences.
7. Validar de nuevo con Supabase Security Advisor y con un usuario real. Jamás revertir habilitando lectura de password_hash al público.

El código preparado y las pruebas sintéticas NO prueban todavía el funcionamiento real autenticado. No aplicar RLS antes de esos pasos.