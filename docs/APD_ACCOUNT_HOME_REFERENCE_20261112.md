# APD — Domicilio de referencia de la cuenta (backend y frontend publicados)

Fecha de diseño: 12/11/2026. Proyecto APDocentePBA; no modifica otros proyectos.

## Evidencia inicial
- En producción, **Datos personales** solo expone nombre, apellido, email y celular. No hay campo domicilio ni columna en public.users o public.user_preferences (consulta de esquema, solo lectura).
- El comparador Insigne conserva domicilio y jornadas únicamente en sessionStorage, borrado con cierre/cambio de sesión.
- Requerimiento: ingresar domicilio **una vez** en Datos personales y reutilizarlo para calcular distancias en el comparador sin escribirlo de nuevo tras cerrar sesión.

## Cambio preparado
1. **SQL aplicada en Supabase el 12/11/2026 (autorización «dale go»)**: \`docs/sql/APD_ACCOUNT_HOME_REFERENCE_CANDIDATE_20261112.sql\`, tabla dedicada \`public.user_home_reference\`, relación a \`users.id\`, RLS activo y **sin privilegios públicos**; solo Service Role del Worker.
2. **Backend publicado el 12/11/2026**: \`scripts/build-account-home-worker-candidate.mjs\` construye un Worker de prueba con GET/PUT/DELETE \`/api/account/home\`. Cada request resuelve \`user_id\` desde sesión Bearer validada; NO acepta IDs de terceros, no registra direcciones, no procesa jornadas de trabajo.
3. **Frontend publicado el 12/11/2026**: \`account_home_reference_patch.js\` crea el campo **Domicilio de referencia** en Datos personales con guardar/borrar y sin persistencia del domicilio en localStorage. El comparador reutiliza la referencia de cuenta; las jornadas siguen siendo privadas de la pestaña.
4. Se guarda \`georef\` únicamente si el usuario eligió/confirmó el punto aproximado mediante la interfaz, con validación estricta de estructura. No se presenta como ubicación GPS o exacta de la vivienda.

## Secuencia de lanzamiento, verificación y pendientes
1. Revisar privacidad, conservación, borrado y seguridad de la nueva tabla. Obtener **aprobación expresa** para migración y cambio de Worker.
2. Aplicar SQL en ventana controlada; comprobar esquema y privilegios. No modificar tablas existentes ni usuarios.
3. Generar candidato Worker desde versión productiva verificada, comparar deriva, ejecutar pruebas de sesión / permisos con dos cuentas sintéticas; preparar rollback. **Sin tráfico productivo** hasta verificar pruebas.
4. Desplegar backend por release manual, conservando bindings, crons, rutas y login actuales. Confirmar sin sesión => 401; sesión A no lee ni cambia domicilio de B; PUT/GET/DELETE reales; error de DB => 503 sin datos inventados.
5. Solo después integrar y publicar el frontend y verificar una **cuenta Insigne real**: guardado en Datos personales, salida y nuevo login, consulta ABC en comparador, edición y eliminación de domicilio. Probar navegador móvil.
6. Rollback frontend a commit previo; Worker al deploy anterior. **No borrar la tabla** si ya contiene datos legítimos: primero exportación y política de conservación.

## Límites explícitos
- Se creó la tabla privada, se promovió el Worker y se publicó el formulario. No se editó ninguna fila de usuario durante la migración; después del lanzamiento los usuarios pueden cargar voluntariamente su domicilio.
- La sesión real del usuario respondió **PASS HTTP 200** en el backend de vista previa (captura suministrada el 12/11/2026). Todavía falta verificar en producción el circuito completo PUT/GET tras cerrar sesión y volver a entrar; no confundir GET autenticado con persistencia demostrada.
- Datos geográficos aproximados no equivalen a distancia por calles ni tiempo de traslado.
- La función de web se habilitó después del backend; ante errores de API la UI debe mostrar el error y conservar la comparación básica. Si aparecen errores reales, detener el cambio y aplicar rollback controlado.

## Ejecución verificable 12/11/2026
- Supabase migración `apd_account_home_reference_private_20261112` aplicada, datos existentes intactos; RLS habilitado; roles `anon` y `authenticated` sin permisos directos; service role con permisos; 0 registros.
- Worker productivo previo al lanzamiento **c36834b1-0a35-4a3f-9a5e-0cc117a00bd7**, diferente del manifiesto original. Se descartó el despliegue directo de ese respaldo desactualizado.
- Candidato armado desde Worker activo (675063 bytes, 29 bindings), preservando todo código anterior salvo la nueva ruta y su handler, con configuración temporal que contiene 4 cron.
- Candidata **3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2**: primero 0 % tráfico, 8/8 checks públicos PASS (https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/43208607275). Luego promovida al **100 % productivo** desde el procedimiento de rollback protegido: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/43230829874 . Smoke posterior 11/11 PASS, 29 bindings preservados. La versión previa queda disponible para rollback.
- Página aislada y de solo lectura en https://alertasapd.com.ar/qa-domicilio-insigne-20261112.html para la validación real autorizada del GET con bearer de la propia sesión. Nunca muestra el token ni el cuerpo de respuesta.
- La captura de la sesión real entregó `PASS HTTP 200` contra el candidato, sin revelar el bearer ni el cuerpo. Se fusionó PR #277 en commit `2807c25b497973dc3a5afaf389a848a50030955a`, con 16/16 controles CI aprobados; Pages deploy https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/43231937184 SUCCESS. Se verificó HTTP 200 y nueva versión en dominio público para index.html, account_home_reference_patch.js y scripts/apd-mi-jornada-ui.mjs.
- **Prueba pendiente del usuario:** guardar el domicilio desde Datos personales, cerrar sesión, volver a iniciar sesión, comprobar la recuperación, usar comparador Insigne, modificar/eliminar si corresponde. No hay prueba real de escrituras PUT/DELETE personales aún.
- **Riesgo de continuidad:** el `worker-live/manifest.json` del repositorio aún referencia la copia anterior `da0632dd-1b9e-4332-9c4a-75b5eade8d74`. El despliegue directo de ese código **permanece prohibido**. Capturar y versionar la fuente exacta de la versión productiva **3bbc9f42** mediante procedimiento separado, auditar la estructura y preservar los cuatro cron antes de nuevos cambios al Worker.
