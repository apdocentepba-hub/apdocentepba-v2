# APD — Domicilio de referencia de la cuenta (candidato NO desplegado)

Fecha de diseño: 12/11/2026. Proyecto APDocentePBA; no modifica otros proyectos.

## Evidencia inicial
- En producción, **Datos personales** solo expone nombre, apellido, email y celular. No hay campo domicilio ni columna en public.users o public.user_preferences (consulta de esquema, solo lectura).
- El comparador Insigne conserva domicilio y jornadas únicamente en sessionStorage, borrado con cierre/cambio de sesión.
- Requerimiento: ingresar domicilio **una vez** en Datos personales y reutilizarlo para calcular distancias en el comparador sin escribirlo de nuevo tras cerrar sesión.

## Cambio preparado
1. **SQL pendiente de aprobación**: \`sql/apd_account_home_reference_20261112.sql\`, tabla dedicada \`public.user_home_reference\`, relación a \`users.id\`, RLS activo y **sin privilegios públicos**; solo Service Role del Worker.
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
- No está desplegado. No se creó ni cambió ninguna fila de usuarios.
- No hay prueba de sesión autenticada real. Tests unitarios y simulación no demuestran producción.
- Datos geográficos aproximados no equivalen a distancia por calles ni tiempo de traslado.
- No habilitar la función solo en web hasta que el backend y la tabla estén confirmados; ante errores de API, la UI debe mostrar el error y conservar la función de comparación básica.
