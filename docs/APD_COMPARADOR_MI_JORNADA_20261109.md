# APDocentePBA — Mi domicilio y jornadas actuales (candidato, 09/11/2026)

## Objetivo y alcance
El usuario pidió que el comparador permita ingresar un domicilio de referencia y las escuelas/horarios de trabajo actuales para detectar incompatibilidades. Se implementó una **primera versión de análisis horario orientativo, no una decisión normativa o de adjudicación**.

### Interfaz
- En el módulo Comparar ofertas, panel y ventana de comparación, aparece la sección desplegable **«Mi domicilio y jornadas actuales (opcional)»**.
- Domicilio libre opcional, máximo 180 caracteres; no se geolocaliza ni se calcula distancia en forma automática.
- Hasta cinco jornadas, cada una con escuela, selección de días lunes a domingo y horario desde/hasta; validación de horas e intervalos.
- Botón «Guardar en esta pestaña»: guarda únicamente en `sessionStorage`, sin POST ni escritura en Supabase. No sincroniza con otros dispositivos ni otras pestañas. Botón de borrado y limpieza al pulsar Cerrar sesión.
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
- CI del primer candidato: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/42676974336, **58/58 tests Node PASS** y Chromium QA en escritorios 1280px y móviles 390px PASS. La prueba de navegador carga una jornada, verifica superposición, comprueba `sessionStorage` y la eliminación al borrar.
- PR en borrador, **no desplegada**. Antes de producción: revisar versión de importación/caché, experiencia visual en navegador autenticado real, accesibilidad, políticas de privacidad y pruebas contra casos de jornadas múltiples.

### Pendientes
1. Verificar en staging la experiencia visual con la cuenta real del usuario, con consentimiento para uso de su información. No guardar ni mostrar sus datos personales en logs.
2. Incorporar, solo si se aprueba, persistencia por cuenta autenticada con cifrado apropiado y reglas de acceso verificadas; nunca guardar domicilio particular sin consentimiento.
3. Integrar, si fuese útil, comparación de rutas reales mediante servicio opt-in y presupuesto de API. La distancia en línea recta entre escuelas verificadas no sustituye tiempo de viaje.
4. Contrastar normativa actual de incompatibilidades docentes de PBA antes de hablar de incompatibilidad administrativa o de adjudicación.
