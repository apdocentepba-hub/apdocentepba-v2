# Laboratorio temporal Mercado Pago — AlertasAPD

Servicio Docker independiente, rama propia, sin dominios, bindings ni credenciales de producción. PostgreSQL 17 sólo escucha en 127.0.0.1 y contiene fixtures sintéticas. No usa Supabase. El contenedor ejecuta Node 22 y las mismas funciones SQL comerciales, junto con completeCheckout; no ejecuta el Worker completo ni valida el runtime nativo de Cloudflare.

El primer despliegue queda bloqueado. Para operar requiere APD_MP_SANDBOX_ACCESS_TOKEN, APD_MP_SANDBOX_SELLER_ID, APD_MP_SANDBOX_WEBHOOK_SECRET y APD_LAB_OPERATOR_KEY (mínimo 32 caracteres). Son variables privadas del nuevo servicio, nunca valores de repositorio. El vendedor se verifica mediante /users/me antes de cada operación. Cada pago debe tener live_mode=false, collector_id exacto, ARS 2000 y referencia del usuario sintético fijo 00000000-0000-4000-8000-000000000007. Los Webhooks requieren HMAC, ID y timestamp reciente. Las operaciones de interfaz requieren sesión y CSRF; la API requiere bearer de operador.

Sólo el operador puede crear el checkout o solicitar la devolución, siempre tras verificar el pago sandbox. Las rutas dejan de operar a los 90 minutos del arranque. La salud del servicio sigue disponible; sin configuración, la portada sólo anuncia bloqueo. Las respuestas y logs no incluyen credenciales.

**Datos temporales:** Render Free elimina el filesystem al reiniciar, desplegar o suspender por inactividad. Un nuevo contenedor pierde las reservas y registros anteriores y rechaza referencias desconocidas. No es apto para producción ni para conservar pruebas duraderas. Registrar evidencia sanitizada antes de cerrar el ensayo. Los recursos Free comparten cuota de horas/build/banda con el espacio; no cambiar planes ni facturación. Desactivar despliegues automáticos y suspender el servicio cuando termine la prueba.

Pruebas: node --test sandbox/mercadopago/lab.test.mjs; CI construye el contenedor y ejecuta integration.mjs contra PostgreSQL real con proveedor simulado. Esto no acredita un pago real del proveedor de test.
