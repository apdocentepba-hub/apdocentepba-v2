import { cleanText, extractLabelValue } from "./worker_pid_shared_v3.js";
import { stripTags, looksLikeDocumentRow, looksLikeMetaLabelRow, isLikelySectionHeading, isHeaderRow, buildHeaderMap, parseRowWithHeader, parseRowHeuristically, deriveLegacyItems, buildHtmlDebugExcerpt } from "./worker_pid_parser_utils_v3.js";

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
    const title = cleanExtractedCellText(titleMatch?.[1] || "");
    const text = cleanExtractedCellText(inner);
    return { text, title };
  });
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
    parsed_section_row_samples: []
  };

  for (const rowHtml of getRows(raw)) {
    debug.total_rows += 1;

    const cells = getCells(rowHtml);
    if (!cells.length) continue;
    debug.rows_with_cells += 1;

    const rowTexts = cells.map((cell) => cleanText(cell.text || cell.title || "")).filter(Boolean);
    const plainRow = cleanText(rowTexts.join(" "));
    if (!plainRow) continue;

    if (looksLikeDocumentRow(plainRow, rowHtml)) {
      debug.skipped_document_rows += 1;
      continue;
    }

    if (looksLikeMetaLabelRow(plainRow)) {
      debug.skipped_meta_rows += 1;
      continue;
    }

    if (isLikelySectionHeading(plainRow, cells)) {
      context.currentSection = cleanText(plainRow);
      context.currentHeaderMap = null;
      context.lastArea = "";
      debug.heading_rows += 1;
      if (debug.heading_samples.length < 10) {
        debug.heading_samples.push({
          text: plainRow,
          cells: rowTexts
        });
      }
      continue;
    }

    if (isHeaderRow(cells, plainRow)) {
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
        debug.parsed_section_row_samples.push({
          by: parsedBy,
          text: plainRow,
          parsed,
          cells: rowTexts
        });
      }
      continue;
    }

    if (debug.noise_samples.length < 10) {
      debug.noise_samples.push({
        text: plainRow,
        cells: rowTexts,
        current_section: context.currentSection
      });
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
    html_debug_excerpt: dedupSectionRows.length || items.length ? undefined : buildHtmlDebugExcerpt(raw)
  };
}
