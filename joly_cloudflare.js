const PID_LOOKUP_VERSION = "2026-04-10-pid-real-table-save-proxy-1";

const PID_LISTADOS = [
  { value: "oficial", label: "Listado Oficial" },
  { value: "108a", label: "Listado 108 a" },
  { value: "fines", label: "Listado FINES 1 (UNO)" },
  { value: "108bfines", label: "Listado FINES 2 (DOS)" },
  { value: "108b", label: "Listado 108 b" },
  { value: "s108a", label: "Listado 108 a Terciario" },
  { value: "s108b", label: "Listado 108 b Terciario" },
  { value: "108ainfine", label: "Listado 108 a In Fine" },
  { value: "108binfine", label: "Listado 108 b In Fine" },
  { value: "108aEncierro", label: "Listado Contextos de Encierro" },
  { value: "108bEncierro", label: "Listado 108 b Contextos de Encierro" },
  { value: "formacionProfesionalPrincipalPreceptores", label: "Listado FP PRINCIPAL PRECEPTORES" },
  { value: "formacionProfesionalComplementoPreceptores", label: "Listado Formacion FP Complementario Preceptores" },
  { value: "formacionProfesionalPrincipalPanol", label: "Listado FP Principal Pañol" },
  { value: "formacionProfesionalComplementarioPanol", label: "Listado FP Complementario Pañol" },
  { value: "formacionProfesionalPrincipalFp", label: "Listado FP Principal Formacion Profesional" },
  { value: "formacionProfesionalComplementarioFp", label: "Listado Complementario Formacion Profesional" }
];

const PID_ALLOWED_LISTADOS = new Set(PID_LISTADOS.map((item) => item.value));

const PID_REAL_COLUMNS = [
  { key: "area", label: "Área" },
  { key: "por_titulo", label: "Por Título" },
  { key: "por_anio_egreso", label: "Por Año de Egreso" },
  { key: "por_promedio_titulo", label: "Por Promedio de Título" },
  { key: "por_antiguedad_rama", label: "Por Antigüedad en la Rama" },
  { key: "por_desfavorabilidad_rama", label: "Por Desfavorabilidad en la Rama" },
  { key: "por_antiguedad_item", label: "Por Antigüedad en el Ítem" },
  { key: "por_desfavorabilidad_item", label: "Por Desfavorabilidad en el Ítem" },
  { key: "por_cargo_titular", label: "Por Cargo Titular" },
  { key: "por_calificacion_1", label: "Por Calificación 1" },
  { key: "por_calificacion_2", label: "Por Calificación 2" },
  { key: "por_bon", label: "Por Bon." },
  { key: "puntaje_total", label: "Puntaje Total" }
];

const PID_STORAGE_WEBAPP =
  "https://script.google.com/macros/s/AKfycbxN1cKD8SWvYpFe0xZ-NZuDe0362NVbaTZuCVRq1EgnsB2ykFZYQd3EZnQxGLFpogs2Yg/exec";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
}

function normalizeDni(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function normalizeYear(value) {
  const year = Number(String(value || "").trim());
  return Number.isInteger(year) && year >= 2015 && year <= 2100 ? year : null;
}

function normalizeListado(value) {
  return String(value || "").trim();
}

function trimStr(value) {
  return String(value ?? "").trim();
}

function b64(value) {
  return btoa(String(value || "").trim());
}

function buildPidUrl(dni, anio, listado) {
  return "http://servicios2.abc.gov.ar/servaddo/puntaje.ingreso.docencia/ingreso.servaddo.cfm" +
    `?documento=${encodeURIComponent(b64(dni))}` +
    `&anio=${encodeURIComponent(b64(String(anio)))}` +
    `&listado=${encodeURIComponent(b64(listado))}` +
    "&tipo=";
}

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#34;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&iacute;/gi, "í")
    .replace(/&eacute;/gi, "é")
    .replace(/&aacute;/gi, "á")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value) {
  return cleanText(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabelValue(html, label) {
  const rx = new RegExp(
    `<label[^>]*>\\s*<b>\\s*${escapeRegExp(label)}\\s*<\\/b>\\s*([^<]*)<\\/label>`,
    "i"
  );
  const match = html.match(rx);
  return cleanText(match?.[1] || "");
}

function stripScriptsAndStyles(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function stripTags(html) {
  return cleanText(stripScriptsAndStyles(html).replace(/<[^>]+>/g, " "));
}

function isNumericLike(value) {
  const raw = cleanText(value).replace(/\s+/g, "");
  if (!raw) return false;
  const normalized = raw.replace(/\.(?=\d{3}(\D|$))/g, "");
  return /^-?\d+(?:[.,]\d+)?$/.test(normalized);
}

function looksLikeFileSize(value) {
  return /\b\d+(?:[.,]\d+)?\s*(KB|MB|GB)\b/i.test(cleanText(value));
}

function looksLikeDateText(value) {
  return /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/.test(cleanText(value));
}

function looksLikeDocumentRow(text, rowHtml) {
  const norm = normalizeComparable(text);
  if (!norm) return false;
  if (/(DECLARACION\s+JURADA|PLANILLA|DESCARGA|DESCARGAR|INSTRUCTIVO|ARCHIVO|DOCUMENTACION|DOCUMENTO|FORMULARIO|ADJUNTO|ANEXO)/.test(norm)) return true;
  if (looksLikeFileSize(text)) return true;
  if (/<a\b[^>]+href=['"][^'"]+\.(pdf|docx?|xlsx?|zip|rar|jpg|jpeg|png)/i.test(rowHtml || "")) return true;
  return false;
}

function looksLikeMetaLabelRow(text) {
  return /(APELLIDO Y NOMBRE|DISTRITO DE RESIDENCIA|DISTRITOS SOLICITADOS|PUNTAJE INGRESO A LA DOCENCIA|LISTADO OFICIAL|OBLEA)/i.test(normalizeComparable(text));
}

function blockLabelLike(value) {
  const norm = normalizeComparable(value);
  if (!norm) return false;
  return /^(TECNICO PROFESIONAL|SECUNDARIA|ADULTOS\s+Y\s+(CFS|CENS)|ADULTOS\s+Y\s+CENS|ARTISTICA|SUPERIOR|INICIAL|PRIMARIA|ESPECIAL|PSICOLOGIA|EDUCACION FISICA|FORMACION PROFESIONAL)\s*(\([A-Z]\))?$/.test(norm);
}

function areaCodeLike(value) {
  const text = cleanText(value);
  if (!text) return false;
  const inner = text.replace(/^\(/, "").replace(/\)$/, "").trim();
  return /^(?:[+\-]?\/?[A-Z0-9]{1,4})(?:\/[A-Z0-9]{1,4})?$/i.test(inner);
}

function parseNumericValue(value) {
  let text = cleanText(value).replace(/\s+/g, "");
  if (!text) return NaN;

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    text = text.replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2) {
      const last = parts[parts.length - 1];
      if (last.length === 3) {
        text = parts.join("");
      } else {
        text = parts.slice(0, -1).join("") + "." + last;
      }
    }
  }

  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

function findTagEnd(html, startIndex) {
  let quote = "";
  for (let i = startIndex; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return -1;
}

function extractBalancedTagBlocks(html, tagNames) {
  const source = String(html || "");
  const wanted = new Set(tagNames.map((t) => String(t).toLowerCase()));
  const out = [];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    const nameMatch = source.slice(lt).match(/^<([a-zA-Z0-9]+)/);
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }

    const tagName = nameMatch[1].toLowerCase();
    if (!wanted.has(tagName)) {
      i = lt + 1;
      continue;
    }

    const openEnd = findTagEnd(source, lt + 1);
    if (openEnd === -1) break;

    let depth = 1;
    let cursor = openEnd + 1;

    while (cursor < source.length && depth > 0) {
      const nextLt = source.indexOf("<", cursor);
      if (nextLt === -1) break;

      const closeMatch = source.slice(nextLt).match(new RegExp(`^<\\/${tagName}\\b`, "i"));
      const openMatch = source.slice(nextLt).match(new RegExp(`^<${tagName}\\b`, "i"));
      if (!closeMatch && !openMatch) {
        cursor = nextLt + 1;
        continue;
      }

      const tagEnd = findTagEnd(source, nextLt + 1);
      if (tagEnd === -1) break;

      if (closeMatch) {
        depth -= 1;
      } else if (openMatch && !/\/\s*>$/.test(source.slice(nextLt, tagEnd + 1))) {
        depth += 1;
      }

      cursor = tagEnd + 1;
    }

    if (depth === 0) {
      out.push(source.slice(lt, cursor));
      i = cursor;
    } else {
      i = openEnd + 1;
    }
  }

  return out;
}

function getRows(raw) {
  return extractBalancedTagBlocks(raw, ["tr"]);
}

function getTables(raw) {
  return extractBalancedTagBlocks(raw, ["table"]);
}

function getFieldsets(raw) {
  return extractBalancedTagBlocks(raw, ["fieldset"]);
}

function cleanExtractedCellText(value) {
  let text = stripTags(value);
  text = text.replace(
    /\b(?:align|valign|width|height|bgcolor|border|cellpadding|cellspacing|rowspan|colspan|style|class|id|title|cargoarea|rpi|onclick|href|target|scope|nowrap|cellstyle|color)\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
    " "
  );
  return cleanText(text);
}

function getCells(rowHtml) {
  const cellBlocks = extractBalancedTagBlocks(rowHtml, ["td", "th"]);
  return cellBlocks.map((block) => {
    const openEnd = findTagEnd(block, 1);
    const inner = openEnd !== -1 ? block.slice(openEnd + 1).replace(/<\/t[dh]\s*>$/i, "") : block;
    return {
      text: cleanExtractedCellText(inner)
    };
  });
}

function getVisibleTexts(cells) {
  return cells.map((cell) => cleanText(cell.text || "")).filter(Boolean);
}

function isHeaderLike(texts) {
  const rowText = normalizeComparable(texts.join(" "));
  if (!rowText) return false;
  return /\bAREA\b/.test(rowText) && /PUNTAJE\s*TOTAL/.test(rowText);
}

function isPureBlockRow(texts) {
  return texts.length === 1 && blockLabelLike(texts[0]);
}

function mapRealPidRow(texts, currentBlock) {
  if (!texts.length) return null;
  if (isHeaderLike(texts)) return null;

  let bloque = currentBlock || "";
  let offset = 0;

  if (blockLabelLike(texts[0]) && texts.length >= 14 && areaCodeLike(texts[1])) {
    bloque = texts[0];
    offset = 1;
  }

  if (!areaCodeLike(texts[offset])) return null;
  if (texts.length < offset + 13) return null;

  const row = {
    bloque,
    area: texts[offset + 0] || "",
    por_titulo: texts[offset + 1] || "",
    por_anio_egreso: texts[offset + 2] || "",
    por_promedio_titulo: texts[offset + 3] || "",
    por_antiguedad_rama: texts[offset + 4] || "",
    por_desfavorabilidad_rama: texts[offset + 5] || "",
    por_antiguedad_item: texts[offset + 6] || "",
    por_desfavorabilidad_item: texts[offset + 7] || "",
    por_cargo_titular: texts[offset + 8] || "",
    por_calificacion_1: texts[offset + 9] || "",
    por_calificacion_2: texts[offset + 10] || "",
    por_bon: texts[offset + 11] || "",
    puntaje_total: texts[offset + 12] || ""
  };

  if (!row.bloque) return null;
  if (!row.area) return null;
  if (!isNumericLike(row.por_titulo)) return null;
  if (!isNumericLike(row.puntaje_total)) return null;

  return row;
}

function rowLooksLikeScoreData(texts) {
  if (!texts.length) return false;
  if (isHeaderLike(texts)) return false;
  if (isPureBlockRow(texts)) return false;
  return Boolean(mapRealPidRow(texts, ""));
}

function scoreTable(tableHtml, index) {
  const rows = getRows(tableHtml);

  let headerRows = 0;
  let blockRows = 0;
  let dataRows = 0;
  let documentRows = 0;
  let metaRows = 0;

  for (const rowHtml of rows) {
    const texts = getVisibleTexts(getCells(rowHtml));
    const rowText = cleanText(texts.join(" "));
    if (!rowText) continue;

    if (looksLikeDocumentRow(rowText, rowHtml)) {
      documentRows += 1;
      continue;
    }
    if (looksLikeMetaLabelRow(rowText)) {
      metaRows += 1;
      continue;
    }
    if (isHeaderLike(texts)) {
      headerRows += 1;
      continue;
    }
    if (isPureBlockRow(texts)) {
      blockRows += 1;
      continue;
    }
    if (rowLooksLikeScoreData(texts)) {
      dataRows += 1;
    }
  }

  let score = 0;
  score += headerRows * 80;
  score += blockRows * 10;
  score += dataRows * 12;
  score -= documentRows * 20;
  score -= metaRows * 10;

  return {
    index,
    html: tableHtml,
    score,
    row_count: rows.length,
    header_rows: headerRows,
    block_rows: blockRows,
    data_rows: dataRows,
    document_rows: documentRows,
    meta_rows: metaRows,
    preview: cleanText(rows.map((row) => stripTags(row)).join(" ")).slice(0, 240)
  };
}

function selectParsingScope(raw) {
  const fieldsets = getFieldsets(raw);
  const selectedFieldset =
    fieldsets.find((block) =>
      /PUNTAJE INGRESO A LA DOCENCIA|Apellido y Nombre|Distrito de Residencia/i.test(stripTags(block))
    ) || "";

  const sources = [];
  if (selectedFieldset) sources.push({ source: "fieldset", html: selectedFieldset });
  sources.push({ source: "raw", html: raw });

  const dedupedTables = [];
  const seen = new Set();

  for (const candidate of sources) {
    const tables = getTables(candidate.html);
    tables.forEach((tableHtml, index) => {
      const key = cleanText(tableHtml);
      if (!key || seen.has(key)) return;
      seen.add(key);
      dedupedTables.push({ ...scoreTable(tableHtml, index), source: candidate.source });
    });
  }

  const scoredTables = dedupedTables.sort((a, b) => b.score - a.score);
  const selectedTable =
    scoredTables.find((table) => table.score > 0 && table.header_rows > 0 && table.data_rows > 0) || null;

  return {
    scopedHtml: selectedTable ? selectedTable.html : (selectedFieldset || raw),
    scopeDebug: {
      scope_root: selectedFieldset ? "fieldset+raw" : "raw",
      tables_found: scoredTables.length,
      selected_table_index: selectedTable ? selectedTable.index : null,
      selected_table_score: selectedTable ? selectedTable.score : null,
      selected_table_source: selectedTable ? selectedTable.source : null,
      selected_table_preview: selectedTable ? selectedTable.preview : "",
      candidate_tables: scoredTables.slice(0, 10).map((table) => ({
        index: table.index,
        source: table.source,
        score: table.score,
        row_count: table.row_count,
        header_rows: table.header_rows,
        block_rows: table.block_rows,
        data_rows: table.data_rows,
        document_rows: table.document_rows,
        meta_rows: table.meta_rows,
        preview: table.preview
      }))
    }
  };
}

function dedupeRealRows(rows) {
  const out = [];
  const seen = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = [
      row.bloque,
      row.area,
      row.por_titulo,
      row.por_anio_egreso,
      row.por_promedio_titulo,
      row.por_antiguedad_rama,
      row.por_desfavorabilidad_rama,
      row.por_antiguedad_item,
      row.por_desfavorabilidad_item,
      row.por_cargo_titular,
      row.por_calificacion_1,
      row.por_calificacion_2,
      row.por_bon,
      row.puntaje_total
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function parsePidHtml(html) {
  const raw = String(html || "");
  const legend = cleanText(
    (((raw.match(/<legend[^>]*>([\s\S]*?)<\/legend>/i) || [])[1]) || "").replace(/<[^>]+>/g, " ")
  );
  const apellido_nombre = extractLabelValue(raw, "Apellido y Nombre");
  const distrito_residencia = extractLabelValue(raw, "Distrito de Residencia");
  const distritos_solicitados = extractLabelValue(raw, "Distritos Solicitados");

  const scope = selectParsingScope(raw);
  const scopedHtml = scope.scopedHtml;

  let currentBlock = "";
  const blocks = [];
  const tableRows = [];
  const debug = {
    total_rows: 0,
    rows_with_cells: 0,
    header_rows: 0,
    block_rows: 0,
    parsed_rows: 0,
    skipped_document_rows: 0,
    skipped_meta_rows: 0,
    noise_samples: [],
    parsed_row_samples: [],
    scope_debug: scope.scopeDebug
  };

  for (const rowHtml of getRows(scopedHtml)) {
    debug.total_rows += 1;

    const cells = getCells(rowHtml);
    const texts = getVisibleTexts(cells);
    const rowText = cleanText(texts.join(" "));
    if (!texts.length || !rowText) continue;
    debug.rows_with_cells += 1;

    if (looksLikeDocumentRow(rowText, rowHtml)) {
      debug.skipped_document_rows += 1;
      continue;
    }

    if (looksLikeMetaLabelRow(rowText)) {
      debug.skipped_meta_rows += 1;
      continue;
    }

    if (isHeaderLike(texts)) {
      debug.header_rows += 1;
      continue;
    }

    if (isPureBlockRow(texts)) {
      currentBlock = texts[0];
      debug.block_rows += 1;
      if (!blocks.includes(currentBlock)) blocks.push(currentBlock);
      continue;
    }

    const row = mapRealPidRow(texts, currentBlock);
    if (row) {
      currentBlock = row.bloque || currentBlock;
      if (row.bloque && !blocks.includes(row.bloque)) blocks.push(row.bloque);
      tableRows.push(row);
      debug.parsed_rows += 1;
      if (debug.parsed_row_samples.length < 10) {
        debug.parsed_row_samples.push({ text: rowText, row });
      }
      continue;
    }

    if (debug.noise_samples.length < 10) {
      debug.noise_samples.push({ text: rowText, cells: texts, current_block: currentBlock });
    }
  }

  const dedupRows = dedupeRealRows(tableRows);

  return {
    result: {
      oblea: legend,
      apellido_nombre,
      distrito_residencia,
      distritos_solicitados,
      blocks,
      table_columns: PID_REAL_COLUMNS,
      table_rows: dedupRows,
      section_columns: PID_REAL_COLUMNS,
      section_rows: dedupRows,
      items: []
    },
    parser_debug: {
      ...debug,
      final_rows: dedupRows.length
    },
    html_debug_excerpt: dedupRows.length ? undefined : cleanText(stripScriptsAndStyles(scopedHtml).replace(/<[^>]+>/g, " | "))
  };
}

async function postPidStorage(payload) {
  try {
    const res = await fetch(PID_STORAGE_WEBAPP, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0 APDocentePBA PID Storage Proxy"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      return {
        ok: false,
        status: 502,
        error: "El Web App no devolvió JSON válido.",
        upstream_status: res.status,
        upstream_body_excerpt: text.slice(0, 500)
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        error: trimStr(parsed?.error || parsed?.message || ("Web App HTTP " + res.status)),
        upstream_status: res.status
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        status: 502,
        error: "Respuesta vacía o inválida del Web App.",
        upstream_status: res.status
      };
    }

    return parsed;
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: trimStr(err?.message || "No se pudo conectar con el Web App.")
    };
  }
}

async function handlePidListados() {
  return json({ ok: true, version: PID_LOOKUP_VERSION, listados: PID_LISTADOS });
}

async function handlePidConsultar(request) {
  const body = await request.json().catch(() => ({}));
  const dni = normalizeDni(body && body.dni);
  const anio = normalizeYear((body && body.anio) || new Date().getFullYear());
  const listado = normalizeListado(body && body.listado);

  if (!/^\d{7,8}$/.test(dni)) {
    return json({ ok: false, error: "DNI inválido. Usá 7 u 8 dígitos." }, 400);
  }
  if (!anio) {
    return json({ ok: false, error: "Año inválido." }, 400);
  }
  if (!PID_ALLOWED_LISTADOS.has(listado)) {
    return json({ ok: false, error: "Listado no permitido." }, 400);
  }

  const upstream_url = buildPidUrl(dni, anio, listado);
  const res = await fetch(upstream_url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 APDocentePBA PID Lookup"
    }
  });

  const html = await res.text();

  if (!res.ok) {
    return json({
      ok: false,
      error: "PID devolvió HTTP " + res.status + ".",
      upstream_status: res.status,
      upstream_url
    }, 502);
  }

  if (!/PUNTAJE INGRESO A LA DOCENCIA|Apellido y Nombre/i.test(html)) {
    return json({
      ok: false,
      error: "La respuesta del PID no parece una oblea válida.",
      upstream_status: res.status,
      upstream_url
    }, 502);
  }

  const parsed = parsePidHtml(html);
  const payload = {
    ok: true,
    version: PID_LOOKUP_VERSION,
    dni,
    anio,
    listado,
    upstream_url,
    parser_debug: parsed.parser_debug,
    result: parsed.result
  };

  if (parsed.html_debug_excerpt) payload.html_debug_excerpt = parsed.html_debug_excerpt;
  return json(payload);
}

async function handlePidGuardar(request) {
  const body = await request.json().catch(() => ({}));
  const docente_id = trimStr(body?.docente_id);

  if (!docente_id) {
    return json({ ok: false, error: "docente_id requerido." }, 400);
  }

  const upstream = await postPidStorage({
    ...body,
    action: "guardar_pid_consulta",
    docente_id
  });

  if (upstream.ok !== true) {
    return json({
      ok: false,
      error: trimStr(upstream.error || "No se pudo guardar PID."),
      upstream_status: upstream.upstream_status || upstream.status || null
    }, upstream.status || 502);
  }

  return json({
    ok: true,
    message: trimStr(upstream.message || "PID guardado correctamente")
  });
}

async function handlePidUltima(request) {
  const body = await request.json().catch(() => ({}));
  const docente_id = trimStr(body?.docente_id);

  if (!docente_id) {
    return json({ ok: false, error: "docente_id requerido." }, 400);
  }

  const upstream = await postPidStorage({
    action: "obtener_ultima_pid_consulta",
    docente_id
  });

  if (upstream.ok !== true) {
    return json({
      ok: false,
      error: trimStr(upstream.error || "No se pudo obtener la última consulta."),
      upstream_status: upstream.upstream_status || upstream.status || null
    }, upstream.status || 502);
  }

  return json(upstream);
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return json({ ok: true, service: "apdocentepba-pid", version: PID_LOOKUP_VERSION });
    }

    if (url.pathname === "/api/pid-listados" && request.method === "GET") {
      return handlePidListados();
    }

    if (url.pathname === "/api/pid-consultar" && request.method === "POST") {
      return handlePidConsultar(request);
    }

    if (url.pathname === "/api/pid-guardar" && request.method === "POST") {
      return handlePidGuardar(request);
    }

    if (url.pathname === "/api/pid-ultima" && request.method === "POST") {
      return handlePidUltima(request);
    }

    return json({ ok: false, error: "Ruta no encontrada" }, 404);
  }
};
