# Insigne LAB — rediseño de utilidad, sin alterar contratos

Fecha: 2026-11-01 (Argentina). Rama `growth/landing-apd-20261101`.
El plan **Insigne actual sigue vigente e intacto**. Esta es una propuesta
experimentable, no un cambio de suscripción ni una funcionalidad anunciable.

## Problema auditado

- El Worker público (`GET /api/planes`) ofrece actualmente Insigne:
  **3 distritos principales + 2 etiquetados como emergencia, 10 cargos**,
  $3.000 ARS/mes (precio fundador de referencia).
- El matcher `matchDistritos` combina el distrito principal con todos los
  demás distritos; `matchCargosMaterias` permite cualquiera de los cargos.
  `coincideOfertaConPreferencias` aplica ambas condiciones por separado.
- **No se conserva una asociación directa distrito–cargo ni se discrimina
  que un distrito adicional sea "solo para emergencia".**
  La palabra «emergencia» de `district_slots` es una etiqueta de interfaz.
- Cinco distritos y diez cargos pueden abarcar hasta **50 pares posibles**,
  pero no se pueden seleccionar pares exactos: más cobertura puede generar
  ruido, sin asegurar más oportunidades reales.

## Propuesta sometida a prueba

| Dimensión | Modelo experimental |
|---|---|
| Distritos habituales | Hasta 3 |
| Combinaciones específicas | Hasta 20 reglas distrito + cargo |
| Distrito adicional | Hasta 1, condicionado a emergencias clasificadas |
| Turnos y niveles | Requiere definición de reglas y compatibilidad con matcher |
| Entrega | No habilitada; usar controles de cuota, plan y canales existentes |
| Datos personales | Ninguno en demo; sin almacenamiento ni API |

**El máximo de 20 es un parámetro de prototipo**, no una decisión de precios
ni una prestación prometida. Se eligió para poder comparar búsqueda precisa
frente al máximo de 15 combinaciones que la competencia anuncia en su plan Gold.
No se equiparan "pares exactos" con los productos cartesianos de filtros.

### Insigne LAB comprobable

- `insigne_rules_lab.js`: módulo puro que valida cupos, elimina coincidencias
  espurias entre distritos/cargos y comprueba emergencia solo por clasificación
  explícita (`isEmergency`, `es_emergencia`, `classification`,
  `tipo_oferta` o `tipo_designacion`). Si falta clasificación, no activa
  una regla exclusiva de emergencia.
- `scripts/previews/insigne-laboratorio.html`: demo interactiva de reglas,
  resultados ficticios, botón de restablecer y avisos de alcance, sin sesiones.
- `scripts/test-insigne-rules-lab.mjs`: tests de pares exactos,
  clasificación, cupos, duplicados, acentos y seguridad.
- `scripts/test-growth-browser.mjs`: smoke en Chrome real del flujo de agregar
  regla, verificar nueva coincidencia y restablecer.
- Preview en https://apdocentepba-growth-preview.onrender.com/insigne-laboratorio.html
  (solo compilación Render, no conectado a `alertasapd.com.ar`).
- Commit de CI: `eba76a93e29e0730a1f4c42585f357e68442b99b`,
  ejecución `41365717790`: 64/64 pruebas automatizadas en total, Chrome OK;
  10/10 checks relacionados exitosos. Sitio Render `dep-dbjta9qjnfac73903sr0`
  marcado LIVE.

## Necesidades antes de habilitar en producción

1. Confirmar si el feed APD entrega **clasificación explícita y confiable** de
   emergencia (por ejemplo normativa 108B y tipo de designación). No inferir
   emergencia de una descripción o de «urgente». Si no existe, no prometer el
   canal exclusivo de emergencia.
2. Definir semántica comercial y permisos: reglas de 20/otro valor, contratos
   existentes, descuento, modalidad anual y cambios posteriores.
3. Persistencia de reglas por `user_id` en un esquema con acceso autenticado;
   valorar tabla nueva con migración reversible y RLS, y límites validados
   del lado Worker. Evitar añadir columnas a `user_preferences` sin plan.
4. Integrar **todos** los caminos de matching (panel, digest email, histórico,
   consultas por Telegram y WhatsApp) o dejar los no compatibles explícitos.
   El prototipo NO cambia ninguno de esos canales.
5. Migración no destructiva: preservar las preferencias y el alcance de las
   cuentas Insigne existentes, usando modo anterior hasta aceptación explícita
   de las nuevas reglas o ofreciendo un modo de compatibilidad.
6. Pruebas de falsos negativos, source sin distrito/rol o emergencia desconocida,
   vencimiento de ofertas, duplicación y rendimiento. End-to-end con cuenta de
   prueba y entregas autorizadas.
7. Lanzamiento controlado con rollback; registrar métricas **agregadas** de
   coincidencias relevantes, no conversiones inventadas.

## Decisión tomada en este PR

**No reducir los distritos existentes, no aumentar cobros, no activar
20 reglas para nadie, no actualizar Supabase ni el Worker**.
Entregar primero laboratorio aislado y evidencias verificadas para decidir
qué oferta es realmente útil para docentes.
