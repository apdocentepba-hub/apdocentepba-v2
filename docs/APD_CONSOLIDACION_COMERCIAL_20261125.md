# AlertasAPD — Consolidación comercial y competitiva (25/11/2026)
Estado: candidato aislado, NO desplegar. Oferta acordada: Gratis permanente (1 distrito, 1 cargo), Completo ARS 2000/mes, 14 días de Completo sin tarjeta ni cobro automático. 5 distritos/10 cargos como propuesta previa. Recursos públicos permanecen libres. Sin modificación de suscripciones antiguas, precios contratados o preferencias almacenadas.
## Criterios de aceptación pendientes
1. Recuperar versión activa exacta de Cloudflare y atestación de hash/bindings. El snapshot canónico es antiguo; smoke 45488375607 falló por versión no aprobada. No sustituir Worker ni relajar guard.
2. Revisar catálogo real, restricciones SQL, vigencia, registro Google y contraseña, pago y webhook; elegir código nuevo sin reutilizar precios históricos. Integrar la política en todas las rutas y crons, no solo frontend.
3. Prueba única con claim atómico (incluye concurrencia y duplicados). Reutilización de prueba para antiguos usuarios NO autorizada por este contrato; requiere política específica.
4. Pago explícito y validación del proveedor; preservar checkout pendiente/recurrencias y reconciliación. Probar pagos simulados y entorno de prueba, nunca generar cobro real sin autorización.
5. Degradar acceso efectivo sin borrar datos: conservar horarios, favoritos, postulaciones y preferencias; elegir subconjunto de alertas gratis de forma explícita. Verificar límites en backend y canales.
6. Compatibilidad completa del plan nuevo con todas las capacidades anteriormente Insigne, además de prueba completa. Mantener derechos adquiridos hasta fin del período.
7. UI real con 2 opciones y estado de prueba, sin ocultar condiciones existentes. Chromium real y pruebas de cuentas aisladas, caducidad, logout, móviles y escritorio. Validar rollback, migración transaccional y despliegue explícito.
## Mejoras competitivas posteriores
- Medición real de latencia/cobertura desde ABC; ofertas vencidas, deduplicación.
- PWA + push: verificar infraestructura existente, entrega y consentimiento. Sin duplicar canales.
- PID: evaluar fuente oficial y compatibilidad de habilitaciones; sin inferir elegibilidad.
- Histórico: puntajes documentados, desiertas, límites de cobertura.
- Comunicados SAD y calendario: fuentes oficiales, fecha de actualización.
- Referidos: crédito por pago verificado, antifraude, no modificar facturación sin autorización.
- Compartir tarjetas: solo datos públicos de ofertas, enlace oficial y marca; sin datos personales.
Cada línea exige evidencia propia, no se presume implementada. No usar Nexo ni servicios pagos.

## Cierre verificable del candidato (head 0dbfba8)
- 53 pruebas de preflight y 40 de política/UI; 22 workflows exitosos, 1 omitido. PostgreSQL descartable pasó ciclo comercial y concurrencia. Runtime de 17 funciones extraídas pasó con servicios simulados.
- Bloqueantes: auditar alertas almacenadas y todos los canales/crons tras downgrade; permisos PID y radar por ruta; prueba navegador con catálogo nuevo; reconciliación de checkout incierto/expirado y disputas, compatibilidad de webhook con reintento; preservar recurrencias; migración y rollback; ensayo integral con Worker completo y base descartable, sin credenciales reales; autorización de publicación.
- Mejoras competitivas posteriores no condicionan el cierre comercial salvo las que se anuncien como incluidas.

## Matriz de avance para el cierre (25/11/2026)
Porcentajes de avance son estimaciones de ingeniería, no mediciones de cobertura ni garantía de producción. Cada módulo usa cuatro hitos: implementación 40%, pruebas aisladas 30%, integración acumulativa 20%, verificación de producción 10%. El último hito requiere publicación autorizada. No sumar suites duplicadas como cobertura total.
- Catálogo y modelo de acceso: 90%, integración de funciones extraídas verificada anteriormente.
- Prueba 14 días y vencimiento: 90%, ciclo de PostgreSQL y runtime extraído.
- Compra y reversión: 90%, pendiente comprobación del proveedor real y recuperación operativa de sesiones inciertas.
- Conservación de preferencias: 90%, concurrencia de PostgreSQL y ensamblado.
- Alertas y canales: 70%, cinco lectores de fuente activa ensamblados, aún sin ejecución integrada de canales.
- PID y radar: 40%, permisos parciales, anclaje de correo pendiente.
- Interfaz y herramientas: 70%, regresiones aisladas, falta navegador con catálogo nuevo.
- Recuperación de checkout incierto: 40%, reserva y exclusión duplicadas; falta procedimiento de resolución con evidencia del proveedor.
- Ensayo integral Worker: 40%, 17 funciones extraídas aprobadas, módulo completo no ejecutado.
- Publicación y rollback: 0%, sin cambios ni autorización de publicación.
Estimación de conjunto con módulos ponderados por igual: 62%. No confundir con pruebas unitarias aprobadas (101/101 en la última ejecución; 61 preflight + 40 política/UI). No declarar terminado por conteo de pruebas.

## Recuperación de contratación incierta
El helper `recoverCompletePreference` consulta únicamente por ID de preferencia conocido y comprueba referencia, propietario, precio, moneda, cantidad, URL y vencimiento antes de llamar al RPC existente de finalización. No genera cobro, no concede acceso ni crea otra preferencia. Sin ID verificable no libera la reserva automáticamente; se requiere conciliación del proveedor. No está conectado a una ruta pública ni se ejecutó contra Mercado Pago. Pendiente: procedimiento operativo autenticado, prueba con proveedor sandbox y resolución de reservas expiradas sin pago.

## Candidato posterior al 70%
- Base 9878ec8: 106/106 pruebas comerciales; 22 controles generales exitosos; PID 3 canales y lectores 5; runtime de funciones extraídas aprobado.
- Recuperación por referencia: GET de búsqueda (MLA, resultado único), GET detalle, validación estricta y finalización del mismo checkout. Sin respuesta concluyente se conserva reserva. Soporte de init_point argentino legado /mla/checkout/start y actual /checkout/. No se libera una reserva por ausencia de búsqueda. Fuente: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/get-preference/get y https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-preferences/get.
- QA módulo completo: vm.SourceTextModule sin importaciones externas y transporte sintético obligatorio; prueba router, identidad, expiración, recuperación, firma HMAC, reintentos, pago y revocación. Aún no ejecutado en la nueva revisión. No sustituye PostgreSQL real ni runtime Cloudflare ni sandbox del proveedor. No cron, no env de producción, no publicación.
