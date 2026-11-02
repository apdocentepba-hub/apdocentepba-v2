# APDocentePBA — candidato de activación y reversión del radar (NO PUBLICADO)

Se prepararon dos componentes del radar: la interfaz que consume el `GET /api/provincia/backfill-status` (PR #198) y el resumen provincial íntegro por páginas con bandera propia (PR #200). Un test conjunto simulado (PR #201) hizo pasar 2.609 ofertas por el Worker compilado sin conexión externa y comprobó el render de la interfaz.

## Preparación exacta
`node scripts/prepare-apd-radar-frontend-release.mjs` genera solamente en `tmp/apd-radar-release-candidate/`:

- `index-preview.html`: igual que `index.html`, salvo una sola etiqueta de script que reemplaza el radar congelado por `candidates/radar_provincia_live_20261102.js?v=1`.
- `index-rollback.html`: copia byte por byte del `index.html` vigente.
- `release-manifest.json`: hashes SHA-256 de los archivos, el cambio exacto y las condiciones pendientes.

No modifica el HTML fuente, el Worker, Supabase, secretos ni publicaciones. El test rechaza cambios inesperados, etiquetas duplicadas, código que envía credenciales y alteraciones del radar original.

## Orden futuro — requiere autorización para publicar
1. Revisar el bundle del Worker paginado en entorno aislado, o desplegarlo **apagado** con reversión verificada (sin activar escrituras ni histórico).
2. Habilitar `APD_PROVINCIA_PAGINATION_ENABLED=true` solo cuando se haya demostrado que las seis páginas del caso real suman correctamente el barrido y que se rechazan las capturas incompletas. Confirmar que el coste de lectura y latencia es aceptable.
3. Probar `GET /api/provincia/resumen` desde un navegador y repetir el control de 2.609 frente a 1.000; no asumir que un barrido anterior sigue teniendo 2.609.
4. Autorizar el cambio exacto de una etiqueta en `index.html`, validar visualización en escritorio y móvil, sesión propia y usuario común.
5. Reversión: restaurar `index-rollback.html` si se observan problemas; apagar inmediatamente `APD_PROVINCIA_PAGINATION_ENABLED` si falla el nuevo resumen. No deshabilitar protecciones ni permisos para forzar resultados.

**Hechos y límites:** pruebas CI con dobles de Supabase no sustituyen un despliegue ni validan contra ABC autenticado. La migración del histórico diario sigue pendiente de un respaldo restaurable de todo el alcance pertinente.
