# APDocentePBA — Mi domicilio y jornadas actuales (candidato, 09/11/2026)

## Objetivo y alcance
El usuario pidió que el comparador permita ingresar un domicilio de referencia y las escuelas/horarios de trabajo actuales para detectar incompatibilidades. Se implementó una **primera versión de análisis horario orientativo, no una decisión normativa o de adjudicación**.

### Interfaz
- En el módulo Comparar ofertas, panel y ventana de comparación, aparece la sección desplegable **«Mi domicilio y jornadas actuales (opcional)»**.
- Domicilio libre opcional, máximo 180 caracteres; no se geolocaliza ni se calcula distancia en forma automática.
- Hasta cinco jornadas, cada una con escuela, selección de días lunes a domingo y horario desde/hasta; validación de horas e intervalos.
- Botón «Guardar en esta pestaña»: guarda únicamente en `sessionStorage`, sin POST ni escritura en Supabase. No sincroniza con otros dispositivos ni otras pestañas. Botón de borrado y limpieza al pulsar Cerrar sesión, cambiar de cuenta autenticada o reiniciar la sesión del comparador.
- Solo después de que el usuario haya pedido verificar ubicaciones oficiales de establecimientos y exista clave/posición WFS verificada, puede abrir voluntariamente un enlace a Google Maps con domicilio de origen. Al pulsar el enlace, el domicilio se entrega a Google para que calcule la ruta; la aplicación no hace esa consulta por cuenta propia.
- No se pide geolocalización, ni dirección de GPS ni permisos del sistema operativo.

### Algoritmo
- Normaliza formatos observados de ABC como `Lunes a Viernes: 7:20HSA 11:50HS` y `Lunes a Viernes: 7:20 a 11:50`, junto con mayúsculas, cero inicial y caracteres invisibles. No da por diferentes horarios equivalentes.
- Convierte días y rangos explícitos a minutos de semana. Si no reconoce días, inicio o fin, devuelve **No evaluable**, nunca «Compatible».
- Para cada oferta indica **Superposición de horarios** cuando hay al menos un día y un intervalo que se cruzan con una jornada declarada. Muestra escuela y horas superpuestas.
- Si no hay intersección exacta, informa **Sin superposición exacta (traslados y normativa no evaluados)**. No presume compatibilidad administrativa, legal o de horarios más allá de lo declarado. Tampoco considera tiempo de viaje, cambios de sede, coincidencias entre suplencias, máximos de carga o regímenes de incompatibilidades oficiales.
- El listado de horas se basa en los datos ya mostrados al usuario para cada oferta, sin consultar otra vez ABC.

### Protección de datos
Es una prueba local de producto. Los campos de domicilio y empleo pueden ser datos personales; por eso no se agregó ninguna tabla, API, Worker, analytics ni log nuevo. Se guardan solo tras pulsar explícitamente Guardar, en la pestaña abierta, y se pueden borrar. `sessionStorage` es accesible para JavaScript del mismo origen, por lo que no reemplaza una arquitectura de protección de datos del servidor y requiere revisión antes de persistir perfiles entre sesiones.

### Evidencia y límites
- PR #269: https://github.com/apdocentepba-hub/apdocentepba-v2/pull/269
- CI del primer candidato: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42676974336, **58/58 tests Node PASS** y Chromium QA en escritorio 1280px y móvil 390px PASS; el test verifica también borrado automático al cambiar de cuenta. La prueba de navegador carga una jornada, verifica superposición, comprueba `sessionStorage` y la eliminación al borrar.
- PR en borrador, **no desplegada**. Antes de producción: revisar versión de importación/caché, experiencia visual en navegador autenticado real, accesibilidad, políticas de privacidad y pruebas contra casos de jornadas múltiples.

### Pendientes
1. Verificar en staging la experiencia visual con la cuenta real del usuario, con consentimiento para uso de su información. No guardar ni mostrar sus datos personales en logs.
2. Incorporar, solo si se aprueba, persistencia por cuenta autenticada con cifrado apropiado y reglas de acceso verificadas; nunca guardar domicilio particular sin consentimiento.
3. Integrar, si fuese útil, comparación de rutas reales mediante servicio opt-in y presupuesto de API. La distancia en línea recta entre escuelas verificadas no sustituye tiempo de viaje.
4. Contrastar normativa actual de incompatibilidades docentes de PBA antes de hablar de incompatibilidad administrativa o de adjudicación.

## Política de acceso definida — Insigne únicamente (09/11/2026)

- El catálogo vigente identifica cuatro niveles principales: Prueba 7 días, Plus, Premium e **Insigne**. La pantalla de planes anuncia la comparación con domicilio y jornadas solamente en la tarjeta Insigne.
- El comparador básico y sus 19 criterios anteriores no cambian para cuentas con acceso confirmado al panel. La sección de domicilio/escuelas/horarios y la fila de cruce con jornada solo se renderizan si el plan actual recibido de `/api/mi-plan` cumple: `access_active === true`, `subscription.plan_code` correspondiente a Insigne/Insigne anual/Signature, estado activo/autorizado/aprobado, sin fuente `fallback_frontend`, sin contradicción con `plan.code`.
- Plus, Premium, plan de prueba, pagos pendientes, suscripciones vencidas o sin verificación **no** tienen acceso a la opción avanzada. La promoción no habilita la función por sí misma; el acceso depende del plan vigente confirmado.
- Un cambio de plan descendente elimina los datos opcionales almacenados en `sessionStorage` de la pestaña y quita la interfaz privada, manteniendo la comparación básica. Cerrar sesión o cambiar de cuenta también borra el perfil.
- Limitación de seguridad: este planificador usa solo datos proporcionados por el propio usuario en el navegador y no consume una API privada de cálculo; por ello la restricción es una **habilitación de producto en interfaz sustentada por la respuesta autenticada del Worker**, no una barrera criptográfica contra quienes manipulen su propio JavaScript. Toda futura API prémium deberá verificar el plan **en el servidor** y nunca confiar en `planInfo` enviado por el cliente.
- Pruebas unitarias de códigos y estados, y pruebas Chromium de Insigne, Plus y degradación sin pérdida del comparador básico. No se modifican cuotas, cobros, tablas ni la lógica de notificaciones.

## Siguiente mejora aislada (candidato, 09/11/2026): márgenes entre jornadas

Se agrega una advertencia **orientativa** cuando la oferta y la jornada declarada no se cruzan en el mismo día pero queda poco tiempo entre sus comienzos y finales. La advertencia resuelve el falso negativo del caso `11:50` → `11:50`, que antes aparecía como «sin superposición» y podía interpretarse como traslado viable.

- Solo Insigne: el perfil opcional incorpora `travelGapMinutes` (0, 15, 30, 45, 60, 90 o 120); opción inicial **30 minutos**, modificable por el docente, con 0 para desactivar advertencias. Los perfiles guardados previamente migran en lectura al valor predeterminado.
- Resultado «Superposición horaria» conserva prioridad ante cualquier conflicto; cuando no hay cruce y el margen disponible es menor al umbral, se indica «Sin cruce, pero traslado a revisar» y los minutos exactos entre jornadas. Nunca se afirma «Compatible» ni «Incompatible legalmente».
- Es una diferencia de relojes entre turnos, no calcula rutas, velocidades, distancia hogar-escuela ni tiempos reales. Las escuelas actuales siguen ingresándose como texto; no se presume que dos nombres iguales sean el mismo establecimiento.
- Todo sigue local en `sessionStorage` y sin envío de domicilio. No modifica Worker, Supabase, planes, cobranzas, escáner ni notificaciones.
- Validaciones: casos límite de 0, 15, 20 y 30 minutos, conflicto prioritario, oferta anterior a jornada, diferentes días, horario incompleto, margen inválido; QA de la tabla en Chromium.
- **Estado:** implementado en rama de laboratorio, sin publicación y sujeto a controles de CI. Validar sesión real Insigne y normativa PBA antes de ofrecer conclusiones adicionales.
