# Laboratorio Mercado Pago: estado verificado — 26/11/2026

Autorización: el usuario confirmó usar el espacio empresarial FLUYNOVA con un recurso separado y sin modificar otros proyectos.

- Rama: lab/mercadopago-isolated-20261126. Código inicial f61df1a959750244e13ec89cb6ea279a8b83d1ea. PR borrador #335, base comercial #334.
- Render: espacio tea-daf0pjv40ujc7392s0eg; servicio nuevo srv-dc3vp0l6e07s73doe40g; nombre alertasapd-mercadopago-lab; región virginia; plan free; autoDeploy=no.
- Despliegue dep-dc3vp0t6e07s73doe4n0: logs confirman live 2026-11-26T09:32:41Z. GET / y /health devuelven 200; salud {ok:true,sandbox:true,paymentsEnabled:false}.
- URL: https://alertasapd-mercadopago-lab.onrender.com. No dominio personalizado ni conexión a Supabase.
- CI https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/45792655237 aprobó: seis unitarios, imagen Docker, PostgreSQL 17 real con proveedor simulado, checkout único, aprobación, duplicado, devolución y replay rechazado.
- No se han cargado access token, firma Webhook ni clave del operador. Sólo está definido el ID no secreto del vendedor de test observado en Developers.
- Pendiente iniciar sesión en Render desde el navegador del usuario para ingresar allí exclusivamente las credenciales sandbox, habilitar la prueba y ejecutarla con cuentas test. No compartir tokens por chat.
- No se modificaron otros servicios. Segunda lectura de Render conserva fluynova-web en main/free/autoDeploy=yes y updatedAt 2026-11-16T17:03:38.097324Z; volve-web en main/autoDeploy=yes y updatedAt 2026-11-03T22:24:35.099851Z, iguales al inventario inicial.

Límites: este harness reutiliza completeCheckout y las RPC SQL, pero no ejecuta el módulo Worker completo ni valida el runtime nativo Cloudflare. La prueba externa de Mercado Pago sigue pendiente. Los datos locales se pierden con reinicio o suspensión por inactividad; conservar evidencia sanitizada antes de terminar y suspender el laboratorio después de usarlo. Se eligió compute free; las cuotas compartidas de build/banda del espacio no pudieron verificarse por falta de sesión web. No se cambió facturación ni planes existentes.

## Actualización — 26/11, 07:48 ART

El usuario cargó las dos credenciales de test directamente en Render y ejecutó Save and deploy. Los cuatro nombres de variables existen; no se registraron sus valores. /health confirmó paymentsEnabled=true. Se guardó únicamente la URL de Webhooks de modo prueba https://alertasapd-mercadopago-lab.onrender.com/webhook; no se modificó el modo productivo ni se restableció la firma.

La entrada HTML falló inicialmente: Referrer-Policy=no-referrer convierte Origin en null en formularios nativos y chocaba con el control de origen. Corrección 3b4a6859c5832b6fbc825a23b446ddc7bc006c80 usa same-origin, conservando rechazo de orígenes opacos/externos y CSRF. Siete unitarios y ensayo de contenedor/PostgreSQL real con proveedor simulado aprobaron en Actions run 45803998444. Despliegue aislado dep-dc40qv6q1p3s73cj3b2g. Se verificaron header efectivo same-origin y entrada real desde Chrome con acceso a la pantalla Prueba habilitada.

Se generó una preferencia real de test a través de Mercado Pago: el código verificó previamente /users/me como vendedor argentino con tag test_user e ID esperado. El checkout mostró AlertasAPD Completo · PRUEBA. No se pulsó Pagar: el navegador conservaba la cuenta PERSONAL del usuario y ofrecía dinero/tarjeta reales. Se seleccionó Cambiar de cuenta, dejando el login para la cuenta Buyer Test User. La pestaña Developers permanece en Cuentas de prueba, Render y checkout se preservan. Pendiente autenticación del comprador de test, tarjeta oficial, aprobación con live_mode=false, activación y devolución. Crear una preferencia no demuestra pago, ni acredita que el Worker de producción funcione.
