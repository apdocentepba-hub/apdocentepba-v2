(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DATA = () => window.AP_DOCENTE_HABERES_CARGOS_SUTEBA_2026_4 || {};
  const LIQ = {
    nombre: "Abril 2026",
    basicoCargo: 392179.20,
    bonificacionBase: 514973.72,
    adicionalMedia: 138896.80,
    conectividad: 28700,
    garantia: 450.14,
    moduloBase: 39217.92,
    horaBase: 23800,
    quintaHoraBase: 98045,
    cuatroYMediaFactor: 1.125,
    dobleBonificacionFactor: 1.28,
    ips: 0.16,
    ioma: 0.048,
    gremial: 0.039
  };

  let ultimo = null;

  function money(n) {
    return "$ " + Number(n || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function num(v) {
    let s = String(v ?? "").replace(/[^0-9,.-]/g, "").trim();
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s) || 0;
  }

  function norm(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }

  function niveles() {
    return Object.keys(DATA()).sort((a, b) => a.localeCompare(b, "es"));
  }

  function antigPct(anios) {
    const a = Number(anios) || 0;
    if (a >= 24) return 1.20;
    if (a >= 22) return 1.10;
    if (a >= 20) return 1.00;
    if (a >= 17) return 0.80;
    if (a >= 15) return 0.70;
    if (a >= 12) return 0.60;
    if (a >= 10) return 0.50;
    if (a >= 7) return 0.40;
    if (a >= 4) return 0.30;
    if (a >= 2) return 0.15;
    if (a >= 1) return 0.10;
    return 0;
  }

  function tipoTexto(tipo) {
    return {
      CARGO: "Cargo",
      MODULOS: "Módulos",
      HORAS: "Horas cátedra",
      QUINTA_HORA: "Quinta hora",
      CUATRO_Y_MEDIA_HORAS: "Cargo 4 1/2 hs",
      DOBLE_BONIFICACION: "Doble bonificación"
    }[tipo] || tipo || "Cargo";
  }

  function cargoActual() {
    const opt = $("cargo").selectedOptions[0];
    return {
      id: opt?.value || "",
      nombre: opt?.textContent || "Sin seleccionar",
      tipo: opt?.dataset.tipo || "CARGO"
    };
  }

  function listarCargos() {
    const nivel = $("nivel").value;
    return DATA()[nivel] || [];
  }

  function cargarNiveles() {
    const ns = niveles();
    $("nivel").innerHTML = ns.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (ns.includes("SECUNDARIA")) $("nivel").value = "SECUNDARIA";
  }

  function cargarAntiguedad() {
    let html = "";
    for (let i = 0; i <= 30; i++) {
      const p = Math.round(antigPct(i) * 100);
      html += `<option value="${i}">${i} año${i === 1 ? "" : "s"} · ${p}%</option>`;
    }
    $("ant").innerHTML = html;
  }

  function cargarCargos() {
    const q = norm($("buscarCargo").value);
    const todos = listarCargos();
    const prev = $("cargo").value;
    const rows = todos.filter((c) => {
      const hay = `${c.nombre} ${c.id} ${c.tipoBloque} ${tipoTexto(c.tipoBloque)}`;
      return !q || norm(hay).includes(q);
    });

    if (!rows.length) {
      $("cargo").innerHTML = '<option value="">Sin resultados</option>';
      $("cargoInfo").textContent = `0 de ${todos.length} cargos encontrados.`;
      $("bloque").value = "";
      return;
    }

    $("cargo").innerHTML = rows.map((c) =>
      `<option value="${esc(c.id)}" data-tipo="${esc(c.tipoBloque || "CARGO")}">${esc(c.nombre)} · #${esc(c.id)}</option>`
    ).join("");

    if (rows.some((c) => String(c.id) === String(prev))) $("cargo").value = prev;
    $("cargoInfo").textContent = `${rows.length} de ${todos.length} cargos visibles en ${$("nivel").value}.`;
    actualizarTipo();
  }

  function actualizarTipo() {
    const c = cargoActual();
    $("bloque").value = tipoTexto(c.tipo);
    if (c.tipo === "MODULOS" && num($("cantidad").value) <= 1) $("cantidad").value = 10;
    if (c.tipo === "HORAS" && num($("cantidad").value) <= 1) $("cantidad").value = 4;
    if (!["MODULOS", "HORAS"].includes(c.tipo) && !num($("cantidad").value)) $("cantidad").value = 1;
  }

  function basePorCargo(c, cantidad) {
    const t = c.tipo;
    const nombre = norm(c.nombre);
    let base = LIQ.basicoCargo;
    let factor = 1;

    if (t === "MODULOS") {
      base = LIQ.moduloBase * cantidad;
      factor = 1;
    } else if (t === "HORAS") {
      base = LIQ.horaBase * cantidad;
      factor = 1;
    } else if (t === "QUINTA_HORA") {
      base = LIQ.quintaHoraBase;
    } else if (t === "CUATRO_Y_MEDIA_HORAS") {
      factor = LIQ.cuatroYMediaFactor;
    } else if (t === "DOBLE_BONIFICACION") {
      factor = LIQ.dobleBonificacionFactor;
    }

    if (nombre.includes("director") || nombre.includes("inspector")) factor *= 1.18;
    if (nombre.includes("secretario") || nombre.includes("regente") || nombre.includes("jefe")) factor *= 1.08;
    if (nombre.includes("preceptor")) factor *= 0.92;
    if (nombre.includes("bibliotecario")) factor *= 0.96;

    return base * factor;
  }

  function calcularModelo() {
    const c = cargoActual();
    if (!c.id) throw new Error("No hay cargo seleccionado.");

    let cantidad = Math.max(num($("cantidad").value), 1);
    if (!["MODULOS", "HORAS"].includes(c.tipo)) cantidad = Math.max(1, Math.round(cantidad));
    const base = basePorCargo(c, cantidad);
    const ant = base * antigPct($("ant").value);
    const bonif = LIQ.bonificacionBase * (base / LIQ.basicoCargo);
    const media = (c.tipo === "MODULOS" || c.tipo === "HORAS" || $("nivel").value === "SECUNDARIA" || $("nivel").value === "SUPERIOR")
      ? LIQ.adicionalMedia * (base / LIQ.basicoCargo)
      : 0;
    const rural = base * num($("ruralidad").value);
    const zona = $("zonaFria").value === "1" ? (base + ant + bonif + media + rural) * 0.30 : 0;
    const extra = num($("extra").value);
    const conectividad = LIQ.conectividad;
    const garantia = LIQ.garantia;

    const remunerativo = base + ant + bonif + media + rural + zona + extra;
    const noRem = conectividad + garantia;
    const bruto = remunerativo + noRem;

    const ips = remunerativo * LIQ.ips;
    const ioma = remunerativo * LIQ.ioma;
    const gremial = $("afiliacion").value === "1" ? remunerativo * LIQ.gremial : 0;
    const otros = num($("descExtra").value);
    const descuentos = ips + ioma + gremial + otros;
    const neto = bruto - descuentos;

    const conceptos = [
      { codigo: "0110", descripcion: "Básico estimado", importe: base },
      { codigo: "0220", descripcion: `Antigüedad (${Math.round(antigPct($("ant").value) * 100)}%)`, importe: ant },
      { codigo: "0451", descripcion: "Bonificaciones remunerativas estimadas", importe: bonif },
      { codigo: "0667", descripcion: "Adicional por bloque/modalidad cuando corresponde", importe: media },
      { codigo: "RUR", descripcion: "Ruralidad/desfavorabilidad estimada", importe: rural },
      { codigo: "ZF", descripcion: "Zona fría estimada", importe: zona },
      { codigo: "2999", descripcion: "Compensación / conectividad de referencia", importe: conectividad },
      { codigo: "OTR", descripcion: "Otros ingresos cargados manualmente", importe: extra },
      { codigo: "GAR", descripcion: "Garantía / redondeo de referencia", importe: garantia }
    ].filter((x) => Math.abs(x.importe) > 0.004);

    const descuentosRows = [
      { codigo: "1060", descripcion: "Aporte previsional estimado", importe: ips },
      { codigo: "1280", descripcion: "Obra social estimada", importe: ioma },
      { codigo: "GR", descripcion: "Descuento gremial/social estimado", importe: gremial },
      { codigo: "OD", descripcion: "Otros descuentos cargados manualmente", importe: otros }
    ].filter((x) => Math.abs(x.importe) > 0.004);

    return { c, cantidad, conceptos, descuentosRows, remunerativo, noRem, bruto, descuentos, neto };
  }

  function tabla(titulo, rows) {
    const body = rows.map((r) =>
      `<tr><td>${esc(r.codigo)}</td><td>${esc(r.descripcion)}</td><td class="num">${money(r.importe)}</td></tr>`
    ).join("");
    return `<h3>${esc(titulo)}</h3><div class="tablewrap"><table><thead><tr><th>Código</th><th>Concepto</th><th class="num">Importe</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function render(res) {
    ultimo = res;
    $("bruto").textContent = money(res.bruto);
    $("descuentos").textContent = money(res.descuentos);
    $("neto").textContent = money(res.neto);
    $("estado").textContent =
      `Resultado orientativo para ${res.c.nombre}\n` +
      `Nivel/modalidad: ${$("nivel").value}\n` +
      `Tipo: ${tipoTexto(res.c.tipo)} · Cantidad: ${res.cantidad}\n` +
      `Liquidación de referencia: ${LIQ.nombre}\n` +
      `Remunerativo estimado: ${money(res.remunerativo)}\n` +
      `No remunerativo estimado: ${money(res.noRem)}`;
    $("tablas").innerHTML = tabla("Ingresos estimados", res.conceptos) + tabla("Descuentos estimados", res.descuentosRows);
    comparar(false);
  }

  function calcular() {
    try {
      render(calcularModelo());
    } catch (e) {
      $("estado").textContent = e.message || "No se pudo calcular.";
    }
  }

  function comparar(actualizar = true) {
    if (!ultimo) {
      $("comparacion").textContent = "Primero calculá una estimación.";
      return;
    }
    const real = num($("netoReal").value);
    if (!real) {
      $("comparacion").textContent = "Todavía no hay comparación con recibo real.";
      return;
    }
    const dif = ultimo.neto - real;
    const pct = real ? Math.abs(dif / real * 100) : 0;
    const lectura = Math.abs(dif) < 1000 ? "Diferencia mínima." : dif > 0 ? "La estimación da más que el recibo real." : "El recibo real da más que la estimación.";
    $("comparacion").textContent =
      `Neto estimado: ${money(ultimo.neto)}\n` +
      `Neto real cargado: ${money(real)}\n` +
      `Diferencia: ${money(Math.abs(dif))} (${pct.toFixed(2)}%)\n` +
      `Lectura: ${lectura}\n` +
      `Observaciones: ${$("obs").value || "sin observaciones"}`;
    if (actualizar) $("comparacion").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function copiarInforme() {
    if (!ultimo) calcular();
    if (!ultimo) return;
    const texto =
      `CALCULADORA DE HABERES DOCENTES PBA - APDOCENTEPBA\n\n` +
      `Liquidación: ${LIQ.nombre}\nNivel/modalidad: ${$("nivel").value}\nCargo: ${ultimo.c.nombre}\n` +
      `Tipo: ${tipoTexto(ultimo.c.tipo)}\nCantidad: ${ultimo.cantidad}\nAntigüedad: ${$("ant").value} años\n` +
      `Ingresos: ${money(ultimo.bruto)}\nDescuentos: ${money(ultimo.descuentos)}\nNeto estimado: ${money(ultimo.neto)}\n\n` +
      `${$("estado").innerText}\n\n${$("tablas").innerText}\n\n${$("comparacion").innerText}`;
    await navigator.clipboard.writeText(texto);
    $("estado").textContent += "\n\nInforme copiado al portapapeles.";
  }

  function limpiar() {
    $("buscarCargo").value = "";
    $("cantidad").value = "1";
    $("ant").value = "0";
    $("ruralidad").value = "0";
    $("zonaFria").value = "0";
    $("afiliacion").value = "0";
    $("extra").value = "0";
    $("descExtra").value = "0";
    $("netoReal").value = "";
    $("obs").value = "";
    cargarCargos();
    $("estado").textContent = "Parámetros reiniciados. Presioná calcular para obtener una nueva estimación.";
    $("bruto").textContent = "-";
    $("descuentos").textContent = "-";
    $("neto").textContent = "-";
    $("tablas").innerHTML = "";
    $("comparacion").textContent = "Todavía no hay comparación con recibo real.";
    ultimo = null;
  }

  function init() {
    if (!niveles().length) {
      $("estado").textContent = "No se pudo cargar la base local de cargos. Revisá que el archivo de datos esté disponible.";
      return;
    }
    cargarNiveles();
    cargarAntiguedad();
    cargarCargos();

    const preferido = Array.from($("cargo").options).find((o) => norm(o.textContent).includes("encargado de medios"));
    if (preferido) $("cargo").value = preferido.value;
    actualizarTipo();

    $("nivel").addEventListener("change", () => { $("buscarCargo").value = ""; cargarCargos(); });
    $("buscarCargo").addEventListener("input", cargarCargos);
    $("cargo").addEventListener("change", actualizarTipo);
    $("btnBuscarLimpiar").addEventListener("click", () => { $("buscarCargo").value = ""; cargarCargos(); });
    $("btnCalcular").addEventListener("click", calcular);
    $("btnCalcular2").addEventListener("click", calcular);
    $("btnCopiar").addEventListener("click", copiarInforme);
    $("btnLimpiar").addEventListener("click", limpiar);
    $("netoReal").addEventListener("input", () => comparar(false));
    $("obs").addEventListener("input", () => comparar(false));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
