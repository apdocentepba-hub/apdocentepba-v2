# Auditoría de compatibilidad: ID de cursor ABC vs source_offer_key de APDocentePBA

**2/11/2026 · Lectura de datos publicados únicamente.**

Los PR #227 y #228 comprobaron una paginación con `cursorMark` y `sort=id asc` en ABC para La Matanza y la coincidencia de 161 IDs durante dos recorridos completos. Eso todavía no confirma que esas identidades puedan incorporarse al almacenamiento de APDocentePBA sin perder historial.

El Worker utiliza la función **real** `buildSourceOfferKeyFromOferta`:
- Si `iddetalle` contiene dígitos, guarda `D_<iddetalle>`.
- Si no, usa los dígitos de `id` como clave `D_<id>`.
- Si falta lo anterior, usa `O_<idoferta>`.
- Como último recurso construye una clave compuesta de datos de la oferta.

Por lo tanto, **`id` de Solr y `source_offer_key` no tienen por qué ser iguales** y una transformación que elimine caracteres no numéricos de `id` podría generar colisiones para documentos distintos. El auditor nuevo extrae la función del Worker original, sin reproducirla manualmente, y registra solamente proporciones, cantidad de claves distintas y posibles colisiones.

La prueba real de La Matanza recorre el índice con `fl=id,iddetalle,idoferta`; no solicita datos personales, escuelas, domicilios, postulaciones, preferencias ni `raw`. Todos los identificadores se comparan **en memoria durante la ejecución**; el reporte agregado omite las claves y los documentos.

La suite de pruebas incluye una colisión sintética del fallback numérico, dos claves `iddetalle` distintas y un recorrido cursor de varias páginas con proyección limitada.

### Límite
Un resultado sin colisiones en el corte observado **no garantiza** ausencia de colisiones en otros distritos, otros días ni otros cambios del origen. Tampoco demuestra que el histórico productivo tenga identificadores equivalentes, ni permite migrar ahora el Worker. No hay escrituras o migraciones en Supabase.

**Próximo control:** comparar estos resultados con el esquema real y diseñar la integración del cursor con staging/confirmación atómica, previo respaldo restaurable y QA. El Worker, la web y las alertas productivas no cambian.
