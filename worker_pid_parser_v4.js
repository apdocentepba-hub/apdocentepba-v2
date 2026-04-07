import { cleanText, extractLabelValue } from "./worker_pid_shared_v3.js";
import { stripTags, looksLikeDocumentRow, looksLikeMetaLabelRow, isLikelySectionHeading, isHeaderRow, buildHeaderMap, parseRowWithHeader, parseRowHeuristically, deriveLegacyItems, buildHtmlDebugExcerpt } from "./worker_pid_parser_utils_v3.js";

function getRows(raw) {
  return String(raw || "").match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
}

function getCells(rowHtml) {
  const matches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
  return matches.map((cellHtml) => ({ text: stripTags(cellHtml), title: "" }));
}

export function parsePidHtml(html) {
  const raw = String(html || "");
  const legend = cleanText((((raw.match(/<legend[^>]*>([\s\S]*?)<\/legend>/i) || [])[1]) || "").replace(/<[^>]+>/g, " "));
  const apellido_nombre = extractLabelValue(raw, "Apellido y Nombre");
  const distrito_residencia = extractLabelValue(raw, "Distrito de Residencia");
  const distritos_solicitados = extractLabelValue(raw, "Distritos Solicitados");

  const context = { currentSection: "", currentHeaderMap: null, lastArea: "", pendingPuntaje: "" };
  const sectionRows = [];
  const legacyFallbackItems = [];
  const debug = { total_rows: 0, rows_with_cells: 0, heading_rows: 0, header_rows: 0, skipped_document_rows: 0, skipped_meta_rows: 0, parsed_section_rows: 0, parsed_legacy_items: 0 };

  for (const rowHtml of getRows(raw)) {
    debug.total_rows += 1;
    const plainRow = stripTags(rowHtml);
    if (!plainRow) continue;
    if (looksLikeDocumentRow(plainRow, rowHtml)) { debug.skipped_document_rows += 1; continue; }
    if (looksLikeMetaLabelRow(plainRow)) { debug.skipped_meta_rows += 1; continue; }

    const cells = getCells(rowHtml);
    if (!cells.length) continue;
    debug.rows_with_cells += 1;

    if (isLikelySectionHeading(plainRow, cells)) {
      context.currentSection = cleanText(plainRow);
      context.currentHeaderMap = null;
      context.lastArea = "";
      debug.heading_rows += 1;
      continue;
    }

    if (isHeaderRow(cells, plainRow)) {
      context.currentHeaderMap = buildHeaderMap(cells);
      debug.header_rows += 1;
      continue;
    }

    let parsed = parseRowWithHeader(cells, context.currentHeaderMap, context);
    if (!parsed) parsed = parseRowHeuristically(cells, context);
    if (parsed) {
      sectionRows.push(parsed);
      debug.parsed_section_rows += 1;
      continue;
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
    result: { oblea: legend, apellido_nombre, distrito_residencia, distritos_solicitados, items, section_rows: dedupSectionRows },
    parser_debug: { ...debug, final_section_rows: dedupSectionRows.length, final_items: items.length },
    html_debug_excerpt: dedupSectionRows.length || items.length ? undefined : buildHtmlDebugExcerpt(raw)
  };
}
