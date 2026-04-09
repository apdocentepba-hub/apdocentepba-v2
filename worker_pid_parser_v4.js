import { cleanText, extractLabelValue, normalizeComparable } from "./worker_pid_shared_v3.js";
import { stripTags, looksLikeDocumentRow, looksLikeMetaLabelRow, isLikelySectionHeading, isHeaderRow, buildHeaderMap, parseRowWithHeader, parseRowHeuristically, deriveLegacyItems, buildHtmlDebugExcerpt, pickLastNumeric, isNumericLike, isPercentLike, detectFieldKind } from "./worker_pid_parser_utils_v3.js";

function findTagEnd(html, startIndex) {
  let quote = "";
  for (let i = startIndex; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
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
      if (closeMatch) depth -= 1;
      else if (openMatch && !/\/\s*>$/.test(source.slice(nextLt, tagEnd + 1))) depth += 1;
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
  text = text.replace(/\b(?:align|valign|width|height|bgcolor|border|cellpadding|cellspacing|rowspan|colspan|style|class|id|title|cargoarea|rpi|onclick|href|target|scope|nowrap|cellstyle|color)\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, " ");
  return cleanText(text);
}

function getCells(rowHtml) {
  const cellBlocks = extractBalancedTagBlocks(rowHtml, ["td", "th"]);
  return cellBlocks.map((block) => {
    const openEnd = findTagEnd(block, 1);
    const openTag = openEnd !== -1 ? block.slice(0, openEnd + 1) : "";
    const inner = openEnd !== -1 ? block.slice(openEnd + 1).replace(/<\/t[dh]\s*>$/i, "") : block;
    const titleMatch = openTag.match(/title=['"]([^'"]*)['"]/i);
    return {
      text: cleanExtractedCellText(inner),
      title: cleanExtractedCellText(titleMatch?.[1] || "")
    };
  });
}

function shortCodeLike(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (/[\/]/.test(text)) return false;
  return /^[A-Z]{1,4}\d{0,3}$/i.test(text);
}

function rowLooksLikeScoreData(rowHtml, cells, rowText) {
  const texts = cells.map((cell) => cleanText(cell.text || cell.title || "")).filter(Boolean);
  if (texts.length < 2 || !rowText) return false;
  if (looksLikeDocumentRow(rowText, rowHtml) || looksLikeMetaLabelRow(rowText)) return false;
  if (isHeaderRow(cells, rowText) || isLikelySectionHeading(rowText, cells)) return false;

  const lastNumeric = pickLastNumeric(texts);
  if (!lastNumeric) return false;
  if (shortCodeLike(texts[0] || "")) return true;

  const nonNumericCount = texts.filter((text) => !isNumericLike(text) && !isPercentLike(text)).length;
  return texts.length >= 4 && nonNumericCount >= 1;
}

function scoreTable(tableHtml, index) {
  const rows = getRows(tableHtml);
  const flatText = cleanText(rows.map((row) => stripTags(row)).join(" "));

  let headerRows = 0;
  let headingRows = 0;
  let dataRows = 0;
  let documentRows = 0;
  let metaRows = 0;

  for (const rowHtml of rows) {
    const cells = getCells(rowHtml);
    if (!cells.length) continue;
    const rowText = cleanText(cells.map((cell) => cleanText(cell.text || cell.title || "")).filter(Boolean).join(" "));
    if (!rowText) continue;

    if (looksLikeDocumentRow(rowText, rowHtml)) {
      documentRows += 1;
      continue;
    }
    if (looksLikeMetaLabelRow(rowText)) {
      metaRows += 1;
      continue;
    }
    if (isHeaderRow(cells, rowText)) {
      headerRows += 1;
      continue;
    }
    if (isLikelySectionHeading(rowText, cells)) {
      headingRows += 1;
      continue;
    }
    if (rowLooksLikeScoreData(rowHtml, cells, rowText)) {
      dataRows += 1;
    }
  }

  let score = 0;
  if (/\bAREA\b/i.test(flatText) && /TITULO/i.test(flatText) && /(PUNTAJE\s*TOTAL|PJE\.?\s*TOTAL)/i.test(flatText)) score += 40;
  score += headerRows * 20;
  score += headingRows * 6;
  score += dataRows * 8;
  score -= documentRows * 18;
  score -= metaRows * 6;
  if (/DOCUMENTOS DE DESCARGA|DECLARACION JURADA|DESCARGA|\b\d+\s*(KB|MB|GB)\b/i.test(flatText)) score -= 30;

  return {
    index,
    html: tableHtml,
    score,
    row_count: rows.length,
    header_rows: headerRows,
    heading_rows: headingRows,
    data_rows: dataRows,
    document_rows: documentRows,
    meta_rows: metaRows,
    preview: flatText.slice(0, 240)
  };
}

function selectParsingScope(raw) {
  const fieldsets = getFieldsets(raw);
  const selectedFieldset = fieldsets.find((block) => /PUNTAJE INGRESO A LA DOCENCIA|Apellido y Nombre|Distrito de Residencia/i.test(stripTags(block))) || "";
  const scopeRoot = selectedFieldset || raw;
  const tables = getTables(scopeRoot);
  const scoredTables = tables.map((tableHtml, index) => scoreTable(tableHtml, index)).sort((a, b) => b.score - a.score);
  const selectedTable = scoredTables.find((table) => table.score > 0 && (table.header_rows > 0 || table.data_rows > 0)) || null;

  return {
    scopedHtml: selectedTable ? selectedTable.html : scopeRoot,
    scopeDebug: {
      scope_root: selectedFieldset ? "fieldset" : "raw",
      tables_found: tables.length,
      selected_table_index: selectedTable ? selectedTable.index : null,
      selected_table_score: selectedTable ? selectedTable.score : null,
      selected_table_preview: selectedTable ? selectedTable.preview : "",
      candidate_tables: scoredTables.slice(0, 10).map((table) => ({
        index: table.index,
        score: table.score,
        row_count: table.row_count,
        header_rows: table.header_rows,
        heading_rows: table.heading_rows,
        data_rows: table.data_rows,
        document_rows: table.document_rows,
        meta_rows: table.meta_rows,
        preview: table.preview
      }))
    }
  };
}

function isRealHeaderRowForOfficial(cells, visibleTexts, visibleRowText, currentHeaderMap) {
  if (currentHeaderMap) return false;
  if (!visibleRowText) return false;
  if (looksLikeDocumentRow(visibleRowText, "") || looksLikeMetaLabelRow(visibleRowText)) return false;

  const norm = normalizeComparable(visibleRowText);
  const explicitHeader = /\bAREA\b/.test(norm) && /TITULO/.test(norm) && /(PUNTAJE\s*TOTAL|PJE\.?\s*TOTAL)/.test(norm);
  if (explicitHeader) return true;

  const numericVisible = visibleTexts.some((text) => isNumericLike(text) || isPercentLike(text));
  if (numericVisible) return false;

  const visibleKinds = cells.map((cell) => detectFieldKind(cell.text || "")).filter(Boolean);
  return new Set(visibleKinds).size >= 3;
}

export function parsePidHtml(html) {
  const raw = String(html || "");
  const legend = cleanText((((raw.match(/<legend[^>]*>([\s\S]*?)<\/legend>/i) || [])[1]) || "").replace(/<[^>]+>/g, " "));
  const apellido_nombre = extractLabelValue(raw, "Apellido y Nombre");
  const distrito_residencia = extractLabelValue(raw, "Distrito de Residencia");
  const distritos_solicitados = extractLabelValue(raw, "Distritos Solicitados");

  const scope = selectParsingScope(raw);
  const scopedHtml = scope.scopedHtml;

  const context = { currentSection: "", currentHeaderMap: null, lastArea: "", pendingPuntaje: "" };
  const sectionRows = [];
  const legacyFallbackItems = [];
  const debug = {
    total_rows: 0,
    rows_with_cells: 0,
    heading_rows: 0,
    header_rows: 0,
    skipped_document_rows: 0,
    skipped_meta_rows: 0,
    parsed_section_rows: 0,
    parsed_legacy_items: 0,
    heading_samples: [],
    noise_samples: [],
    parsed_section_row_samples: [],
    scope_debug: scope.scopeDebug
  };

  for (const rowHtml of getRows(scopedHtml)) {
    debug.total_rows += 1;
    const cells = getCells(rowHtml);
    if (!cells.length) continue;
    debug.rows_with_cells += 1;

    const visibleTexts = cells.map((cell) => cleanText(cell.text || "")).filter(Boolean);
    const visibleOnlyCells = cells.map((cell) => ({ text: cleanText(cell.text || ""), title: "" }));
    const plainRow = cleanText(visibleTexts.join(" "));
    if (!plainRow) continue;

    if (looksLikeDocumentRow(plainRow, rowHtml)) {
      debug.skipped_document_rows += 1;
      continue;
    }
    if (looksLikeMetaLabelRow(plainRow)) {
      debug.skipped_meta_rows += 1;
      continue;
    }

    if (isLikelySectionHeading(plainRow, visibleOnlyCells)) {
      context.currentSection = cleanText(plainRow);
      context.currentHeaderMap = null;
      context.lastArea = "";
      debug.heading_rows += 1;
      if (debug.heading_samples.length < 10) debug.heading_samples.push({ text: plainRow, cells: visibleTexts });
      continue;
    }

    if (isRealHeaderRowForOfficial(visibleOnlyCells, visibleTexts, plainRow, context.currentHeaderMap)) {
      context.currentHeaderMap = buildHeaderMap(cells);
      debug.header_rows += 1;
      continue;
    }

    let parsed = parseRowWithHeader(cells, context.currentHeaderMap, context);
    let parsedBy = parsed ? "header" : "";
    if (!parsed) {
      parsed = parseRowHeuristically(cells, context);
      if (parsed) parsedBy = "heuristic";
    }

    if (parsed) {
      sectionRows.push(parsed);
      debug.parsed_section_rows += 1;
      if (debug.parsed_section_row_samples.length < 10) {
        debug.parsed_section_row_samples.push({ by: parsedBy, text: plainRow, parsed, cells: visibleTexts });
      }
      continue;
    }

    if (debug.noise_samples.length < 10) {
      debug.noise_samples.push({ text: plainRow, cells: visibleTexts, current_section: context.currentSection });
    }
  }

  const dedupSectionRows = [];
  const seenRows = new Set();
  for (const row of sectionRows) {
    const key = [row.bloque, row.area, row.titulo, row.porcentaje, row.puntaje_total].join("|");
    if (seenRows.has(key)) continue;
    seenRows.add(key);
    dedupSectionRows.push(row);
  }

  const items = deriveLegacyItems(dedupSectionRows, legacyFallbackItems);

  return {
    result: {
      oblea: legend,
      apellido_nombre,
      distrito_residencia,
      distritos_solicitados,
      items,
      section_rows: dedupSectionRows
    },
    parser_debug: {
      ...debug,
      final_section_rows: dedupSectionRows.length,
      final_items: items.length
    },
    html_debug_excerpt: dedupSectionRows.length || items.length ? undefined : buildHtmlDebugExcerpt(scopedHtml)
  };
}
