import { cleanText, normalizeComparable } from "./worker_pid_shared_v3.js";

export function stripScriptsAndStyles(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

export function stripTags(html) {
  return cleanText(stripScriptsAndStyles(html).replace(/<[^>]+>/g, " "));
}

export function isNumericLike(value) {
  const raw = cleanText(value).replace(/\s+/g, "");
  if (!raw) return false;
  const normalized = raw.replace(/\.(?=\d{3}(\D|$))/g, "");
  return /^-?\d+(?:[.,]\d+)?$/.test(normalized);
}

export function isPercentLike(value) {
  return /\d+(?:[.,]\d+)?\s*%/.test(cleanText(value));
}

export function looksLikeFileSize(value) {
  return /\b\d+(?:[.,]\d+)?\s*(KB|MB|GB)\b/i.test(cleanText(value));
}

export function detectFieldKind(value) {
  const text = normalizeComparable(value);
  if (!text) return "";
  if (/PUNTAJE\s*TOTAL|PJE\.?\s*TOTAL|TOTAL\s*PUNTAJE/.test(text)) return "puntaje_total";
  if (/PORC|PORCENTAJE|%/.test(text)) return "porcentaje";
  if (/\bAREA\b/.test(text)) return "area";
  if (/TITULO|CARGO|MATERIA|ASIGNATURA|ESPACIO\s+CURRICULAR/.test(text)) return "titulo";
  return "";
}

export function looksLikeDocumentRow(text, rowHtml) {
  const norm = normalizeComparable(text);
  if (!norm) return false;
  if (/(DECLARACION\s+JURADA|PLANILLA|DESCARGA|DESCARGAR|INSTRUCTIVO|ARCHIVO|DOCUMENTACION|DOCUMENTO|FORMULARIO|ADJUNTO|ANEXO)/.test(norm)) return true;
  if (looksLikeFileSize(text)) return true;
  if (/<a\b[^>]+href=['"][^'"]+\.(pdf|docx?|xlsx?|zip|rar|jpg|jpeg|png)/i.test(rowHtml || "")) return true;
  return false;
}

export function looksLikeMetaLabelRow(text) {
  return /(APELLIDO Y NOMBRE|DISTRITO DE RESIDENCIA|DISTRITOS SOLICITADOS|PUNTAJE INGRESO A LA DOCENCIA|LISTADO OFICIAL|OBLEA)/i.test(normalizeComparable(text));
}

function shortCodeLike(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (/[\/]/.test(text)) return false;
  return /^[A-Z]{1,4}\d{0,3}$/i.test(text);
}

function blockLabelLike(value) {
  const norm = normalizeComparable(value);
  if (!norm) return false;
  return /^(TECNICO PROFESIONAL|SECUNDARIA|ADULTOS\s+Y\s+(CFS|CENS)|ARTISTICA|SUPERIOR|INICIAL|PRIMARIA|ESPECIAL|PSICOLOGIA|EDUCACION FISICA|FORMACION PROFESIONAL)\s*(\([A-Z]\))?$/.test(norm);
}

function areaCodeLike(value) {
  const text = cleanText(value);
  if (!text) return false;
  return /^\(?[A-Z]{1,4}(?:\/[A-Z0-9]{1,4})?\)?$/i.test(text);
}

function itemTitleLike(value) {
  return /^ITEM\s+\d+/i.test(cleanText(value));
}

function rowLooksLikeBlockAreaItem(texts) {
  const meaningful = texts.filter(Boolean);
  if (meaningful.length < 5) return false;

  const first = meaningful[0] || "";
  const second = meaningful[1] || "";
  const third = meaningful[2] || "";
  const tail = meaningful.slice(3);

  const hasPercent = tail.some((text) => isPercentLike(text));
  const hasNumeric = tail.some((text) => isNumericLike(text));

  return blockLabelLike(first) && areaCodeLike(second) && itemTitleLike(third) && hasPercent && hasNumeric;
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

function looksLikeDateText(value) {
  return /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/.test(cleanText(value));
}

function extractBlockAreaItemCandidate(texts) {
  const meaningful = texts.filter(Boolean);
  if (!rowLooksLikeBlockAreaItem(meaningful)) return null;

  const bloque = meaningful[0] || "";
  const area = meaningful[1] || "";
  const titulo = meaningful[2] || "";
  const tail = meaningful.slice(3);

  const porcentaje = tail.find((text) => isPercentLike(text)) || "";

  const numericTail = tail.filter((text) => isNumericLike(text) && !looksLikeDateText(text));
  const nonZeroNumericTail = numericTail.filter((text) => {
    const n = parseNumericValue(text);
    return Number.isFinite(n) && n > 0;
  });

  const puntaje_total = nonZeroNumericTail.length
    ? nonZeroNumericTail[nonZeroNumericTail.length - 1]
    : (numericTail.length ? numericTail[numericTail.length - 1] : "");

  if (!puntaje_total) return null;

  return { bloque, area, titulo, porcentaje, puntaje_total };
}

export function isLikelySectionHeading(text, cells) {
  const norm = normalizeComparable(text);
  if (!norm) return false;
  if (looksLikeDocumentRow(text, "") || looksLikeMetaLabelRow(text)) return false;
  if (detectFieldKind(text)) return false;

  const nonEmptyTexts = cells.map((cell) => cleanText(cell.text || cell.title || "")).filter(Boolean);
  const nonNumericTexts = nonEmptyTexts.filter((value) => !isNumericLike(value) && !isPercentLike(value));
  const numericCount = nonEmptyTexts.length - nonNumericTexts.length;

  if (/^(TECNICO PROFESIONAL|SECUNDARIA|ADULTOS\s+Y\s+(CFS|CENS)|ARTISTICA|SUPERIOR|INICIAL|PRIMARIA|ESPECIAL|PSICOLOGIA|EDUCACION FISICA|FORMACION PROFESIONAL)\b/.test(norm)) {
    return numericCount === 0 && nonNumericTexts.length >= 1;
  }

  if (numericCount > 0) return false;
  if (nonNumericTexts.length === 0) return false;

  if (nonNumericTexts.length <= 3) {
    const combined = normalizeComparable(nonNumericTexts.join(" "));
    const compact = combined.replace(/[\s()\/.:-]/g, "");
    if (compact && compact === compact.toUpperCase() && /[A-Z]/.test(compact) && !/\d/.test(compact)) {
      return true;
    }
  }

  return false;
}

export function isHeaderRow(cells, rowText) {
  const kinds = cells.map((cell) => detectFieldKind(cell.title || cell.text || "")).filter(Boolean);
  if (new Set(kinds).size >= 3) return true;
  const norm = normalizeComparable(rowText);
  return /\bAREA\b/.test(norm) && /TITULO/.test(norm) && /(PUNTAJE\s*TOTAL|PJE\.?\s*TOTAL)/.test(norm);
}

export function buildHeaderMap(cells) {
  const map = {};
  cells.forEach((cell, index) => {
    const kind = detectFieldKind(cell.title || cell.text || "");
    if (kind && map[kind] == null) map[kind] = index;
  });
  return map;
}

export function pickLastNumeric(texts) {
  const numeric = texts.filter((text) => isNumericLike(text) || isPercentLike(text));
  return numeric.length ? numeric[numeric.length - 1] : "";
}

export function pickFirstPercentOrNumeric(texts, exceptValue = "") {
  for (const text of texts) {
    if (text !== exceptValue && isPercentLike(text)) return text;
  }
  for (const text of texts) {
    if (text !== exceptValue && isNumericLike(text)) return text;
  }
  return "";
}

export function isIgnorableDataToken(value) {
  const norm = normalizeComparable(value);
  if (!norm) return true;
  if (detectFieldKind(norm)) return true;
  if (/^(PROM|BON|ANTIG|RAMA|TIT|TIT\.|OBS|COD|CODIGO|FECHA)$/.test(norm)) return true;
  return false;
}

export function looksLikeNoiseDataRow(texts) {
  const meaningful = texts.filter(Boolean);
  if (!meaningful.length) return true;

  if (rowLooksLikeBlockAreaItem(meaningful)) return false;

  const first = meaningful[0] || "";
  const lastNumeric = pickLastNumeric(meaningful);
  const numericCount = meaningful.filter((text) => isNumericLike(text) || isPercentLike(text)).length;
  const hasLongText = meaningful.some((text) => /[A-Za-zÁÉÍÓÚÑ]/.test(text) && cleanText(text).length >= 6);

  if (hasLongText) return false;
  if (shortCodeLike(first) && lastNumeric && numericCount >= 1) return false;

  return meaningful.every((text) => {
    if (isNumericLike(text) || isPercentLike(text)) return true;
    const norm = normalizeComparable(text);
    return norm.length <= 3;
  });
}

export function finalizeSectionRow(candidate, context) {
  const bloque = cleanText(candidate.bloque || context.currentSection || "");
  let area = cleanText(candidate.area || "");
  let titulo = cleanText(candidate.titulo || "");
  let porcentaje = cleanText(candidate.porcentaje || "");
  let puntaje_total = cleanText(candidate.puntaje_total || "");

  if (!puntaje_total && context.pendingPuntaje) puntaje_total = context.pendingPuntaje;
  if (!area && context.lastArea && titulo) area = context.lastArea;
  if (area && !looksLikeFileSize(area) && !detectFieldKind(area)) context.lastArea = area;
  if (!titulo || detectFieldKind(titulo)) return null;
  if (!puntaje_total && !porcentaje) return null;
  if (looksLikeDocumentRow(`${bloque} ${area} ${titulo} ${porcentaje} ${puntaje_total}`, "")) return null;

  return { bloque, area, titulo, porcentaje, puntaje_total };
}

export function parseRowWithHeader(cells, headerMap, context) {
  if (!headerMap || Object.keys(headerMap).length < 3) return null;

  const texts = cells.map((cell) => cleanText(cell.text)).filter(Boolean);
  if (!texts.length) return null;

  const shaped = extractBlockAreaItemCandidate(texts);
  if (shaped) return finalizeSectionRow(shaped, context);

  const candidate = {
    area: headerMap.area != null ? cells[headerMap.area]?.text || "" : "",
    titulo: headerMap.titulo != null ? cells[headerMap.titulo]?.text || "" : "",
    porcentaje: headerMap.porcentaje != null ? cells[headerMap.porcentaje]?.text || "" : "",
    puntaje_total: headerMap.puntaje_total != null ? cells[headerMap.puntaje_total]?.text || "" : ""
  };

  if (!candidate.puntaje_total) candidate.puntaje_total = pickLastNumeric(texts);
  if (!candidate.porcentaje) candidate.porcentaje = pickFirstPercentOrNumeric(texts, candidate.puntaje_total);

  if (!candidate.area || !candidate.titulo) {
    const nonNumeric = texts.filter((text) => !isNumericLike(text) && !isPercentLike(text) && !isIgnorableDataToken(text));
    if (!candidate.area && nonNumeric.length >= 2) candidate.area = nonNumeric[0];
    if (!candidate.titulo && nonNumeric.length >= 2) candidate.titulo = nonNumeric.slice(1).join(" ");
    if (!candidate.titulo && nonNumeric.length === 1) candidate.titulo = nonNumeric[0];
  }

  return finalizeSectionRow(candidate, context);
}

export function parseRowHeuristically(cells, context) {
  const texts = cells.map((cell) => cleanText(cell.text)).filter(Boolean);
  if (texts.length < 2 || looksLikeNoiseDataRow(texts)) return null;

  const shaped = extractBlockAreaItemCandidate(texts);
  if (shaped) return finalizeSectionRow(shaped, context);

  const first = texts[0] || "";
  const puntaje_total = pickLastNumeric(texts);
  const porcentaje = pickFirstPercentOrNumeric(texts, puntaje_total);

  if (context.currentSection && shortCodeLike(first) && puntaje_total) {
    const middle = texts.slice(1, Math.max(1, texts.length - 1));
    const nonNumericMiddle = middle.filter((text) => !isNumericLike(text) && !isPercentLike(text) && !isIgnorableDataToken(text));
    const titulo = nonNumericMiddle.length ? nonNumericMiddle.join(" ") : (middle[0] || first);
    return finalizeSectionRow({ area: first, titulo, porcentaje, puntaje_total }, context);
  }

  const nonNumeric = texts.filter((text) => !isNumericLike(text) && !isPercentLike(text) && !isIgnorableDataToken(text));
  if ((!puntaje_total && !porcentaje) || !nonNumeric.length) return null;

  const area = nonNumeric.length >= 2 ? nonNumeric[0] : (context.lastArea || "");
  const titulo = nonNumeric.length >= 2 ? nonNumeric.slice(1).join(" ") : nonNumeric[0];
  return finalizeSectionRow({ area, titulo, porcentaje, puntaje_total }, context);
}

export function deriveLegacyItems(sectionRows, fallbackItems) {
  const items = [];
  const seen = new Set();

  for (const row of Array.isArray(sectionRows) ? sectionRows : []) {
    const codigo = cleanText(row?.area || "");
    const rama = cleanText(row?.bloque || "");
    const puntaje = cleanText(row?.puntaje_total || row?.porcentaje || "");
    const item = { codigo, rama, puntaje, fecha: "" };
    const key = [item.codigo, item.rama, item.puntaje, item.fecha].join("|");
    if (!item.codigo && !item.rama && !item.puntaje) continue;
    if (/^[A-Z]\/[A-Z]$/i.test(item.codigo) && !item.puntaje) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  for (const item of Array.isArray(fallbackItems) ? fallbackItems : []) {
    const normalized = {
      codigo: cleanText(item?.codigo || ""),
      rama: cleanText(item?.rama || ""),
      puntaje: cleanText(item?.puntaje || ""),
      fecha: cleanText(item?.fecha || "")
    };
    const key = [normalized.codigo, normalized.rama, normalized.puntaje, normalized.fecha].join("|");
    if (!normalized.codigo && !normalized.rama && !normalized.puntaje && !normalized.fecha) continue;
    if (/^[A-Z]\/[A-Z]$/i.test(normalized.codigo) && !normalized.puntaje && !normalized.fecha) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
  }

  return items;
}

export function buildHtmlDebugExcerpt(html) {
  const raw = stripScriptsAndStyles(html);
  const anchorMatch = raw.match(/(AREA|TITULO|PUNTAJE\s*TOTAL|PJE\.?\s*TOTAL)/i);
  const anchorIndex = anchorMatch?.index ?? 0;
  const start = Math.max(0, anchorIndex - 1400);
  const end = Math.min(raw.length, anchorIndex + 2600);
  return cleanText(raw.slice(start, end).replace(/<[^>]+>/g, " | "));
}
