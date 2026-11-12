# APDocentePBA — variante PID con concurrencia limitada (04/11/2026)

**Estado: INVESTIGACIÓN. No subir a Cloudflare, no fusionar el PR ni activar tráfico.**

## Problema confirmado

En el Worker original, `obtenerUltimaPidGuardada` consulta una secuencia de siete nombres de acción de lectura hacia el almacenamiento PID. Cuando ninguna devuelve un resultado normalizable, esas siete llamadas se esperan una detrás de otra. El ensayo con el router completo de APD reprodujo siete intentos sin PID.

## Cambio aislado

- Generador: `scripts/build-apd-pid-bounded-research-candidate.mjs`.
- Entrada inmutable: `tmp/apd-published-query-research/worker_hotfix.js`, SHA-256 `19c8ab235ca8a07fee305797ad895d9e588535f754ded12470c58f1a83f3e870`.
- Salida: `tmp/apd-published-pid-research/worker_hotfix.js`, SHA-256 `d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f`.
- Única función alterada: `obtenerUltimaPidGuardada`.
- Mantiene las siete acciones, prueba cada par simultáneamente (máximo dos en vuelo) y evalúa las respuestas en el orden original. El primer resultado válido según la prioridad previa sigue prevaleciendo.
- No aplica caché de datos personales; no cambia planes, preferencias, consultas ABC, autenticación ni envíos.
- Particularidad: si el resultado prioritario aparece en el primer elemento de un par, la segunda consulta ya habrá sido iniciada. Eso aumenta a lo sumo una solicitud frente al esquema secuencial en los casos de éxito temprano. Verificar límites del proveedor PID antes de publicar.

## Evidencia verificable

[GitHub Actions #41838159357](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41838159357) — SUCCESS.

- **7/7 pruebas de fallback PID:** sin datos, resultado en la primera acción, dos resultados simultáneos con prioridades distintas, recuperación posterior, errores, ID vacío y benchmark sintético.
- **Router de sesión: 4/4**, **API-carrusel: 2/2**, **ruta integral autenticada ficticia: 1/1** para la tercera variante. Resultado: dos ofertas compatibles de seis ficticias provenientes de dos distritos simulados.
- **Bench sintético:** con siete respuestas ficticias de 20 ms: 142 ms secuencial y 81 ms con concurrencia limitada, aproximadamente 43 % menos **en ese único ensayo simulado**. No es latencia real del servicio PID ni del panel.
- Compilación con Wrangler en `--dry-run` aprobada sin credenciales de despliegue.
- La auditoría de Cloudflare de solo lectura reconfirmó la versión original `da0632dd-1b9e-4332-9c4a-75b5eade8d74` al 100 % del tráfico, 29 vínculos y cuatro tareas programadas; no hubo modificaciones.

## Bloqueos para completar el lanzamiento

1. Medir respuesta real de la ruta autenticada de prueba con sesión propia y sin exponer tokens en logs; medir latencias ABC, PID y tiempo total de la API.
2. Confirmar que el proveedor PID acepta dos consultas simultáneas sin errores ni límites, y que la prioridad entre formatos sigue siendo correcta ante respuestas concurrentes.
3. Comparar ofertas exactas, vigencia, filtros, PID y carrusel del Worker productivo frente a la variante filtrada.
4. Antes de cualquier carga nueva a Cloudflare, validar versión activa, hash, 29 bindings, cuatro cron y mecanismo de reversión. **Requiere autorización expresa por separado para subir versión de ensayo (0 %) y para asignar tráfico productivo.**

Las tres versiones no deben confundirse: producción original (100 %), primer candidato de concurrencia ABC (0 % ya almacenado) y variantes experimentales de filtro «Publicada» + PID (solo CI).
