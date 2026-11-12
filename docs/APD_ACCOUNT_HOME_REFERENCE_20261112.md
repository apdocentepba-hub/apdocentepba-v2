# APD — Domicilio de referencia de la cuenta (candidato NO desplegado)

Fecha de diseño: 12/11/2026. Proyecto APDocentePBA; no modifica otros proyectos.

## Evidencia inicial
- En producción, **Datos personales** solo expone nombre, apellido, email y celular. No hay campo domicilio ni columna en public.users o public.user_preferences (consulta de esquema, solo lectura).
- El comparador Insigne conserva domicilio y jornadas únicamente en sessionStorage, borrado con cierre/cambio de sesión.
- Requerimiento: ingresar domicilio **una vez** en Datos personales y reutilizarlo para calcular distancias en el comparador sin escribirlo de nuevo tras cerrar sesión.

## Cambio preparado
1. **SQL aplicada en Supabase el 12/11/2026 (autorización «dale go»)**: \`docs/sql/APD_ACCOUNT_HOME_REFERENCE_CANDIDATE_20261112.sql\`, tabla dedicada \`public.user_home_reference\`, relación a \`users.id\`, RLS activo y **sin privilegios públicos**; solo Service Role del Worker.
2. **Backend pendiente de despliegue**: \`scripts/build-account-home-worker-candidate.mjs\` construye un Worker de prueba con GET/PUT/DELETE \`/api/account/home\`. Cada request resuelve \`user_id\` desde sesión Bearer validada; NO acepta IDs de terceros, no registra direcciones, no procesa jornadas de trabajo.
3. **Frontend pendiente de despliegue**: \`account_home_reference_patch.js\` crea el campo **Domicilio de referencia** en Datos personales con guardar/borrar y sin persistencia del domicilio en localStorage. El comparador reutiliza la referencia de cuenta; las jornadas siguen siendo privadas de la pestaña.
4. Se guarda \`georef\` únicamente si el usuario eligió/confirmó el punto aproximado mediante la interfaz, con validación estricta de estructura. No se presenta como ubicación GPS o exacta de la vivienda.

## Secuencia de lanzamiento obligatoria
1. Revisar privacidad, conservación, borrado y seguridad de la nueva tabla. Obtener **aprobación expresa** para migración y cambio de Worker.
2. Aplicar SQL en ventana controlada; comprobar esquema y privilegios. No modificar tablas existentes ni usuarios.
3. Generar candidato Worker desde versión productiva verificada, comparar deriva, ejecutar pruebas de sesión / permisos con dos cuentas sintéticas; preparar rollback. **Sin tráfico productivo** hasta verificar pruebas.
4. Desplegar backend por release manual, conservando bindings, crons, rutas y login actuales. Confirmar sin sesión => 401; sesión A no lee ni cambia domicilio de B; PUT/GET/DELETE reales; error de DB => 503 sin datos inventados.
5. Solo después integrar y publicar el frontend y verificar una **cuenta Insigne real**: guardado en Datos personales, salida y nuevo login, consulta ABC en comparador, edición y eliminación de domicilio. Probar navegador móvil.
6. Rollback frontend a commit previo; Worker al deploy anterior. **No borrar la tabla** si ya contiene datos legítimos: primero exportación y política de conservación.

## Límites explícitos
- Solo la tabla privada está creada y verificada (RLS activo, anon/authenticated sin acceso, service_role autorizado, 0 filas). El Worker y el formulario siguen sin publicarse. No se modificaron filas de usuarios.
- No hay prueba de sesión autenticada real. Tests unitarios y simulación no demuestran producción.
- Datos geográficos aproximados no equivalen a distancia por calles ni tiempo de traslado.
- No habilitar la función solo en web hasta que el backend y la tabla estén confirmados; ante errores de API, la UI debe mostrar el error y conservar la función de comparación básica.

## Ejecución verificable 12/11/2026
- Supabase migración `apd_account_home_reference_private_20261112` aplicada, datos existentes intactos; RLS habilitado; roles `anon` y `authenticated` sin permisos directos; service role con permisos; 0 registros.
- Worker productivo actual **c36834b1-0a35-4a3f-9a5e-0cc117a00bd7** difiere del manifiesto anterior; se evitó cualquier deploy del respaldo desactualizado.
- Candidato armado desde Worker activo (675063 bytes, 29 bindings), preservando todo código anterior salvo la nueva ruta y su handler, con configuración temporal que contiene 4 cron.
- Version URL candidata **3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2**: subida a Cloudflare con **0 % tráfico real**. CI https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/43208607275 — 8/8 checks HTTP públicos PASS; Worker activo sigue 100 % en c36834b1.
- Página aislada y de solo lectura en https://alertasapd.com.ar/qa-domicilio-insigne-20261112.html para la validación real autorizada del GET con bearer de la propia sesión. Nunca muestra el token ni el cuerpo de respuesta.
- Aún falta resultado de usuario `PASS HTTP 200` con su propia sesión, antes de promover versión y luego publicar formulario Insigne. No declarar QA de sesión real aprobada sin esa evidencia.
