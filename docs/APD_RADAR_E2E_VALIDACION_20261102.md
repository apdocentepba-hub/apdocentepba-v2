# APDocentePBA — validación conjunta de radar y API corregida

Fecha: 02/11/2026. **Código de prueba; sin desplegar y sin conexión a servicios reales.**

`scripts/test-apd-radar-e2e-preview.mjs` integra en una única prueba:

- El Worker productivo compilado canónico, incorporando en memoria el hook de paginación del PR #200.
- Las rutas reales `default.fetch` del Worker; no se prueban solamente funciones aisladas.
- Un backend Supabase falso que devuelve 2609 ofertas y 137 distritos, sin tokens o credenciales reales.
- La interfaz candidata del PR #198 ejecutada en un DOM aislado.

## Criterios
1. La petición `GET /api/provincia/resumen` habilitada devuelve `total_ofertas=2609` y el indicador de verificación.
2. Se consultan seis páginas de 500 registros como máximo; nunca se hace un POST.
3. El radar muestra 137/137 distritos y 2609 *ofertas detectadas*, siempre diferenciadas de vacantes vigentes.
4. Si el conjunto está truncado en 1000, si existen claves duplicadas o el barrido no está completo, el Worker devuelve 503; no produce estadísticas falsas.
5. Todas las peticiones externas quedan interceptadas. El Worker de producción y `index.html` conservan sus fuentes originales.

**No confundir prueba integrada con QA real.** La activación necesita despliegue autorizado y comprobación con datos de Supabase reales, con reversión preparada. La aplicación del histórico diario continúa condicionada a un respaldo recuperable.
