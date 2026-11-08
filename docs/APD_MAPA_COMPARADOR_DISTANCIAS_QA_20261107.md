# APDocentePBA — Oferta → Mapa ABC → Comparador geográfico

**Fecha:** 7 de noviembre de 2026, Argentina (registros CI UTC 8/11).
**Estado:** laboratorio integrado PR #258, borrador, no publicado ni fusionado.
**Fuente:** Mapa Escolar de la Provincia de Buenos Aires, servicio WFS público anónimo.

## Implementación comprobable

1. El usuario autenticado, con plan confirmado y acceso activo, visualiza el carrusel actual de ofertas.
2. Un módulo de mapa independiente agrega un vínculo a `mapa-escuelas-pba.html?clave=...&distrito=...` cuando la oferta tiene una clave provincial válida. La página consulta exclusivamente la capa pública WFS oficial correspondiente a MS, MT, MA, PP, JI, IS o EE. Una ubicación ambigua, inexistente o fuera de la provincia **no produce un marcador**. El caso de modalidades sin capa verificada no inventa coordenadas.
3. El comparador permite seleccionar hasta 5 ofertas ya visibles en esa sesión, sin backend nuevo ni persistencia. Ordena por cierre verificable o preferencias.
4. Solo al tocar **Consultar distancias oficiales**, se ejecutan como máximo cinco consultas anónimas GET (una por clave escolar única) al WFS. Una clave se verifica únicamente con un resultado geográfico único y consistente; se descartan duplicados, otras claves y coordenadas inválidas.
5. El usuario puede ordenar por **distancia en línea recta desde otra escuela seleccionada**. Se listan además los pares de escuelas verificadas, hasta diez pares si fueran cinco escuelas distintas. Nunca se deduce tiempo de viaje, recorrido, probabilidad de designación ni dirección del docente.
6. El mapa y el comparador se montan mediante módulos de carga diferida disparados por un `MutationObserver` de hijos directos del carrusel. **`app_v2.js` permanece idéntico a `main`**. No hay etiquetas `<script src>` nuevas en el orden de scripts existente.
7. Sesión cerrada, plan sin acceso o cambio de cuenta: se limpian selecciones, coordenadas y pendientes. Las respuestas WFS tardías se descartan mediante `AbortController` e identificadores de ejecución; el resultado de un usuario no reaparece en otra cuenta.

## Límites y seguridad
- Nunca se invoca `navigator.geolocation`; se compara escuela contra escuela, no usuario contra escuela.
- No se usan cookies ni autorización para consultar el WFS; se omiten credenciales expresamente.
- Filtro CQL limitado a clave alfanumérica de 10 caracteres; respuesta máxima 300KB, 9s de timeout, `count=5` y cinco solicitudes máximas por acción explícita.
- No se envían correos, mensajes, avisos push ni datos de postulantes.
- La distancia es gran círculo aproximada y se redondea a décimas de km. No es distancia de viaje ni garantía de acceso vehicular.
- Si ABC no responde, el comparador indica ubicación no verificada y evita asignar distancia cero.
- No se modifica Cloudflare Worker, base Supabase ni permisos de usuarios.

## Evidencia CI
- Tests Node de comparador, acceso/aislamiento de sesión, fechas y WFS: 31/31 PASS en [Actions de PR #258](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/258/checks).
- Chromium real en tamaños 390 y 1280px: carga diferida, selección, cierre/cambio de sesión, protección frente a HTML malicioso, búsqueda de pares geográficos, ausencia de WFS hasta el clic y descarte de respuesta tardía. La cartografía oficial del mapa se mockea en esta prueba; no es una prueba Android física.
- Tests independientes del mapa/overlay/WFS y navegador Chromium: 15/15 PASS; mapa visible, punto único, enlace ABC y recuperación segura ante caída.
- Diagnóstico anónimo WFS real: para claves `0005MS0004` y `0005MT0006`, GET HTTP 200, una coincidencia oficial con CUE, domicilio y coordenadas; CORS permitido desde el dominio APD.
- Comprobar todos los checks de regresión del repositorio antes de publicar. La PR es borrador por diseño.

## Antes de publicar
- Verificar manualmente en al menos un Android físico y un navegador de escritorio usando datos públicos de una oferta vigente, sin registrar ubicación del docente.
- Revisar los límites de uso, licencia y caché del WFS de ABC antes de distribuir esta función a muchos usuarios.
- Confirmar qué PR se publicará: #258 une mapa y comparador pero **no incorpora la corrección de estadísticas históricas que se trabajó por separado en #255**, porque prioriza dejar el núcleo intacto. No fusionar ambas en orden arbitrario: revisar conflictos y alcance.
- Validar rollback de HTML/CSS/módulos y preservación de la sesión y alertas.
- Obtener autorización explícita previa a producción.

**No se desplegó nada, ni se envió aviso real a terceros.**
