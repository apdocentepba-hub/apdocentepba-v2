# Comprobación de radar publicado — APDocentePBA

`scripts/audit-apd-public-radar-deployment.mjs` realiza solo peticiones públicas GET a `https://alertasapd.com.ar/` y al archivo JavaScript que carga ese HTML. Verifica que exista exactamente **un** script de radar provincial y que su hash SHA-256 coincida con el código fuente en el repositorio.

La auditoría distingue dos estados: `legacy` (radar con cifras fijas) o `candidate` (radar de lectura real). No accede a sesiones, no obtiene datos personales, no modifica la web ni el Worker y no habilita ninguna bandera.

La comprobación es necesaria antes y después de cualquier publicación para evitar confundir código fusionado en `main` con código realmente servido al usuario. Un resultado correcto **no demuestra** que el radar funcione con sesiones reales; sólo certifica el archivo público y la unicidad de su inclusión.

El histórico diario de Supabase continúa fuera del alcance de esta auditoría.
