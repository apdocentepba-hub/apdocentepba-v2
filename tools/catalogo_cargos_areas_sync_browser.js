(async () => {
  const TOTAL_PAGES = 232;
  const WAIT_MS = 120;
  const seen = new Set();
  const rows = [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clean = (s) =>
    String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const norm = (s) =>
    clean(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

  const decodeHtml = (s) => {
    const doc = new DOMParser().parseFromString(String(s || ""), "text/html");
    return clean(doc.documentElement.textContent || "");
  };

  function pushRow(codigo, descripcion, page) {
    const codigoClean = clean(codigo).replace(/^\*+/, "");
    const descripcionClean = clean(descripcion);

    if (!descripcionClean) return;
    if (/^codigo$/i.test(codigoClean) || /^descripcion$/i.test(descripcionClean)) return;

    const key = `${norm(codigoClean)}|${norm(descripcionClean)}`;
    if (seen.has(key)) return;
    seen.add(key);

    rows.push({
      codigo: codigoClean || null,
      descripcion: descripcionClean,
      nombre_norm: norm(descripcionClean),
      codigo_norm: codigoClean ? norm(codigoClean) : null,
      fuente: "abc",
      pagina: page
    });
  }

  function parseDocument(doc, page) {
    const tableRows = [...doc.querySelectorAll("table tr")];

    for (const tr of tableRows) {
      const cells = [...tr.querySelectorAll("td,th")].map((cell) => clean(cell.textContent));
      if (cells.length >= 2) {
        pushRow(cells[0], cells[1], page);
      }
    }

    if (rows.length) return;

    const html = String(doc.documentElement.outerHTML || "");
    const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = re.exec(html))) {
      const rowHtml = match[1];
      const cols = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => decodeHtml(m[1]));
      if (cols.length >= 2) {
        pushRow(cols[0], cols[1], page);
      }
    }
  }

  for (let page = 1; page <= TOTAL_PAGES; page += 1) {
    const url = new URL(location.href);
    url.searchParams.set("page", page);

    console.log(`Leyendo página ${page}/${TOTAL_PAGES}...`);

    let html = "";
    try {
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) {
        console.warn(`Página ${page}: HTTP ${res.status}`);
        continue;
      }
      html = await res.text();
    } catch (err) {
      console.warn(`Página ${page}: fetch error`, err);
      continue;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    parseDocument(doc, page);
    await sleep(WAIT_MS);
  }

  rows.sort((a, b) => {
    const byCode = String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", {
      numeric: true,
      sensitivity: "base"
    });
    if (byCode !== 0) return byCode;
    return String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", {
      sensitivity: "base"
    });
  });

  const compact = rows.map((row) => ({
    codigo: row.codigo,
    codigo_norm: row.codigo_norm,
    nombre: row.descripcion,
    nombre_norm: row.nombre_norm,
    apd_nombre: row.descripcion,
    apd_nombre_norm: row.nombre_norm,
    fuente: "github_seed",
    pagina: row.pagina
  }));

  console.log(`Listo. Registros únicos: ${compact.length}`);

  const jsonBlob = new Blob([JSON.stringify(compact, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const a1 = document.createElement("a");
  a1.href = jsonUrl;
  a1.download = "catalogo_cargos_areas_seed.json";
  document.body.appendChild(a1);
  a1.click();
  a1.remove();

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["codigo", "codigo_norm", "nombre", "nombre_norm", "apd_nombre", "apd_nombre_norm", "fuente", "pagina"].join(","),
    ...compact.map((row) => [
      esc(row.codigo),
      esc(row.codigo_norm),
      esc(row.nombre),
      esc(row.nombre_norm),
      esc(row.apd_nombre),
      esc(row.apd_nombre_norm),
      esc(row.fuente),
      esc(row.pagina)
    ].join(","))
  ].join("\n");

  const csvBlob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const csvUrl = URL.createObjectURL(csvBlob);
  const a2 = document.createElement("a");
  a2.href = csvUrl;
  a2.download = "catalogo_cargos_areas_seed.csv";
  document.body.appendChild(a2);
  a2.click();
  a2.remove();

  console.log("Descargados: catalogo_cargos_areas_seed.json y catalogo_cargos_areas_seed.csv");
})();
