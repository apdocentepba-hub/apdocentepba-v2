(function () {
  const API_URL = "https://vvgkinkvojqwfuqaxijh.supabase.co/rest/v1";
  const API_KEY = "sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT";
  const LIMIT = 12;
  const DEBOUNCE_MS = 90;
  const INPUT_IDS = Array.from({ length: 10 }, (_, i) => `pref-cargo-${i + 1}`);
  const LIST_IDS = Array.from({ length: 10 }, (_, i) => `sug-cargo-${i + 1}`);
  const aliasMap = {
    CCD: "CONSTRUCCION DE LA CIUDADANIA",
    NTICX: "NUEVAS TECNOLOGIAS DE LA INFORMACION Y LA CONECTIVIDAD",
    ACO: "ENCARGADO MEDIOS APOYO TEC-PED.CONSTRUCCIONES",
    EMATP: "ENCARGADO MEDIOS APOYO TEC-PED.INF/COMP/E INF.APL."
  };

  function norm(value) {
    return String(value || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s().\/-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function debounce(fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function mergeSuggestionItems(items) {
    const out = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const label = String(item?.label || "").trim();
      const key = norm(label);
      if (!label || !key || seen.has(key)) return;
      seen.add(key);
      out.push({ label });
    });
    return out;
  }

  function buildLabel(row) {
    const codigo = String(row?.codigo || "").trim().toUpperCase();
    const nombre = String(row?.nombre || row?.apd_nombre || "").trim().toUpperCase();
    if (!nombre) return "";
    return codigo ? `${nombre} (${codigo})` : nombre;
  }

  async function supabaseFetch(path) {
    const res = await fetch(`${API_URL}/${path}`, {
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  }

  async function searchCargoSuggestions(query) {
    const needle = norm(query);
    if (!needle || needle.length < 2) return [];

    const variants = [needle];
    if (aliasMap[needle]) variants.push(norm(aliasMap[needle]));

    const results = [];
    for (const term of variants) {
      const cleaned = term.replace(/\s+/g, "*");
      const patterns = [`${cleaned}*`, `*${cleaned}*`];

      for (const pattern of patterns) {
        const orFilter = encodeURIComponent(
          `(codigo.ilike.${pattern},nombre_norm.ilike.${pattern},apd_nombre_norm.ilike.${pattern})`
        );
        const rows = await supabaseFetch(
          `catalogo_cargos_areas?select=codigo,nombre,apd_nombre,nombre_norm,apd_nombre_norm&or=${orFilter}&order=nombre.asc&limit=${LIMIT}`
        );
        results.push(...(Array.isArray(rows) ? rows : []).map((row) => ({ label: buildLabel(row) })));
      }
    }

    return mergeSuggestionItems(results).slice(0, LIMIT);
  }

  async function resolveCargoValue(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";

    const upper = raw.toUpperCase().replace(/\s+/g, " ").trim();
    const exactWithCode = upper.match(/^(.*?)\s*\(([A-Z0-9./-]{2,20})\)\s*$/);
    if (exactWithCode) return `${String(exactWithCode[1] || "").trim().toUpperCase()} (${String(exactWithCode[2] || "").trim().toUpperCase()})`;

    const normalized = norm(upper);
    const aliasName = aliasMap[normalized];
    if (aliasName) {
      return `${aliasName} (${normalized})`;
    }

    try {
      const code = encodeURIComponent(normalized.replace(/\s+/g, ""));
      const rowsByCode = await supabaseFetch(
        `catalogo_cargos_areas?select=codigo,nombre,apd_nombre&codigo=eq.${code}&limit=1`
      );
      if (Array.isArray(rowsByCode) && rowsByCode[0]) return buildLabel(rowsByCode[0]);
    } catch (_) {}

    return upper;
  }

  function hideList(list) {
    list.innerHTML = "";
    list.style.display = "none";
  }

  function renderList(input, list, items) {
    if (!items.length) {
      hideList(list);
      return;
    }

    list.innerHTML = items.map((item, i) => `
      <div class="ac-item ${i === 0 ? "is-active" : ""}" data-index="${i}">${esc(item.label)}</div>
    `).join("");
    list.style.display = "block";

    list.querySelectorAll(".ac-item").forEach((el) => {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        input.value = String(el.textContent || "").trim();
        hideList(list);
      });
    });
  }

  function attachOverride(inputId, listId) {
    const oldInput = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!oldInput || !list) return;

    const input = oldInput.cloneNode(true);
    oldInput.parentNode.replaceChild(input, oldInput);

    const search = debounce(async () => {
      const q = input.value.trim();
      if (!q) {
        hideList(list);
        return;
      }
      try {
        const items = await searchCargoSuggestions(q);
        if (input.value.trim() !== q) return;
        renderList(input, list, items);
      } catch (_) {
        hideList(list);
      }
    }, DEBOUNCE_MS);

    input.addEventListener("input", search);
    input.addEventListener("focus", () => {
      if (input.value.trim()) search();
    });
    input.addEventListener("blur", () => {
      setTimeout(() => hideList(list), 180);
    });
    input.addEventListener("keydown", async (ev) => {
      if (ev.key === "Enter") {
        input.value = await resolveCargoValue(input.value);
        hideList(list);
      }
      if (ev.key === "Escape") hideList(list);
    });
  }

  async function normalizeCargoInputsBeforeSubmit() {
    for (const inputId of INPUT_IDS) {
      const input = document.getElementById(inputId);
      if (!input) continue;
      input.value = await resolveCargoValue(input.value);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    INPUT_IDS.forEach((inputId, idx) => attachOverride(inputId, LIST_IDS[idx]));

    const form = document.getElementById("form-preferencias");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        normalizeCargoInputsBeforeSubmit().then(() => form.requestSubmit()).catch(() => form.requestSubmit());
      }, true);
    }
  });
})();
