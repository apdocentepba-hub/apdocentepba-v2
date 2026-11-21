# APDocente — mensajes de recuperación (BORRADORES, NO ENVIAR)

**Campaña propuesta:** `apd_reactivation_202610_v1`

**Estado:** `DRAFT / SEND_BLOCKED`. Los textos son borradores. El sistema actual no tiene una preferencia independiente de marketing comprobada ni un mecanismo de baja de campañas; en consecuencia, **no enviar ningún correo** y **no usar directamente la API transaccional de Brevo para distribuir estos textos**. Las comunicaciones promocionales deben procesarse como campaña de marketing, con consentimiento/base legal revisada, exclusiones y baja operativa.

## A. Exusuarios de prueba gratuita (39 potenciales; NO 39 autorizados)

**Asunto propuesto:** `Publicidad | Tus alertas de APDocente pueden volver a activarse`

Hola:

Tu prueba gratuita de APDocente terminó y, por ahora, las alertas personalizadas no están activas.

Si querés volver a recibir avisos de ofertas docentes según tus preferencias, podés ingresar a APDocente, revisar los planes vigentes y elegir el que mejor te sirva.

**Ver mis opciones:** https://alertasapd.com.ar/

Si ya configuraste tus filtros, podés revisarlos cuando vuelvas a ingresar.

Esta comunicación es promocional. Si preferís no recibir más mensajes promocionales de APDocente, podés darte de baja desde el enlace de este correo: **[enlace de baja proporcionado por Brevo Campaigns; falta implementar]**.

APDocentePBA

## B. Exusuarios de planes Plus / Insigne (4 potenciales; NO 4 autorizados)

**Asunto propuesto:** `Publicidad | Revisá cómo reactivar tu plan de APDocente`

Hola:

Según nuestros registros, el período de tu suscripción a APDocente finalizó y tus alertas personalizadas quedaron inactivas.

Si querés retomar el servicio, podés ingresar y consultar las opciones de suscripción actuales. Tus preferencias anteriores, si las habías configurado, pueden revisarse desde tu cuenta.

**Consultar planes:** https://alertasapd.com.ar/

Si ya renovaste o tenés un beneficio especial, ignorá este aviso. Antes de cualquier envío debemos volver a comprobar en tiempo real si tu acceso está vigente.

Esta comunicación es promocional. Para dejar de recibir mensajes promocionales de APDocente, utilizá el enlace de baja de esta campaña: **[enlace de baja proporcionado por Brevo Campaigns; falta implementar]**.

APDocentePBA

## Condiciones técnicas ANTES de distribuir

1. Definir claramente si el correo se tramitará como campaña comercial de Brevo y configurar baja real (no usar un enlace inventado ni enviar el marcador en texto).
2. Asegurar un método válido para verificar base legal/consentimiento y consultar la lista de exclusiones y bloqueados del proveedor antes de enviar.
3. Segmentar dinámicamente y volver a comprobar plan en vigor, excepciones, cuenta activa, desuscripción, dirección, errores de entrega, duplicados y envío previo en el mismo momento de envío.
4. Realizar un envío de prueba únicamente a una dirección propia, previa autorización.
5. Limitar inicialmente el volumen y registrar campañas enviadas de forma deduplicada.
6. Preservar las notificaciones operativas (p. ej., recuperación de contraseña) aun cuando un contacto solicite no recibir marketing, si corresponde.

Las preferencias de **alertas docentes** y el campo `consentimiento_datos` de perfil **NO prueban por sí solos aceptación de marketing**.

**Referencias para revisión jurídica y operativa:**
- https://www.argentina.gob.ar/normativa/nacional/decreto-1558-2001-70368/texto (artículo 27)
- https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-4-2009-151221/texto (derecho de retiro/bloqueo y publicidad)
- https://help.brevo.com/hc/en-us/articles/9741388688402-Do-I-need-to-add-an-unsubscribe-link-to-my-emails

**Nunca pegar una lista de emails o IDs de la base en GitHub ni en un chat.**
