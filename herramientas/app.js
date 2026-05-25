const $ = (id) => document.getElementById(id);

const tipos = {
  nota_directivo: {
    titulo: 'Nota a directivo',
    encabezado: 'A la Dirección de la institución',
    pedido: 'solicito se tenga a bien considerar la situación planteada y arbitrar los medios que correspondan.'
  },
  nota_sad: {
    titulo: 'Nota a SAD',
    encabezado: 'A la Secretaría de Asuntos Docentes',
    pedido: 'solicito se tenga a bien recepcionar la presente y orientar o intervenir según corresponda.'
  },
  reclamo_haberes: {
    titulo: 'Reclamo por haberes',
    encabezado: 'A quien corresponda',
    pedido: 'solicito se revise la situación informada respecto de la liquidación de haberes y se indique el curso administrativo correspondiente.'
  },
  reclamo_situacion_revista: {
    titulo: 'Reclamo por situación de revista',
    encabezado: 'A quien corresponda',
    pedido: 'solicito la revisión de mi situación de revista y la actualización o rectificación que corresponda en los sistemas pertinentes.'
  },
  acta_recepcion_documentacion: {
    titulo: 'Acta de recepción de documentación',
    encabezado: 'Acta',
    pedido: 'se deja constancia de la recepción de la documentación indicada, quedando sujeta a revisión administrativa por las autoridades correspondientes.'
  },
  acta_devolucion: {
    titulo: 'Acta de devolución',
    encabezado: 'Acta',
    pedido: 'se deja constancia de la devolución realizada y de las observaciones asentadas en la presente.'
  },
  descargo_docente: {
    titulo: 'Descargo docente',
    encabezado: 'A quien corresponda',
    pedido: 'presento el presente descargo a fin de dejar constancia de mi versión de los hechos y solicitar que sea incorporado a las actuaciones correspondientes.'
  },
  comunicacion_familia: {
    titulo: 'Comunicación a familia',
    encabezado: 'A la familia',
    pedido: 'se solicita tomar conocimiento de la presente comunicación y, de corresponder, acercarse a la institución o responder por los canales habituales.'
  }
};

function limpiarTexto(valor, fallback = '') {
  return (valor || '').trim() || fallback;
}

function tonoIntro(tono) {
  const mapa = {
    formal: 'Por medio de la presente, me dirijo a usted de manera formal y respetuosa',
    conciliador: 'Por medio de la presente, me dirijo a usted con el fin de encontrar una vía de diálogo y resolución',
    firme: 'Por medio de la presente, me dirijo a usted de manera respetuosa, dejando expresa constancia de la situación',
    breve: 'Me dirijo a usted a fin de informar la siguiente situación'
  };
  return mapa[tono] || mapa.formal;
}

function generarDocumento(data) {
  const cfg = tipos[data.tipoDocumento] || tipos.nota_directivo;
  const lugarFecha = limpiarTexto(data.localidadFecha, 'Lugar y fecha: ........................................');
  const destinatario = limpiarTexto(data.destinatario, cfg.encabezado);
  const nombre = limpiarTexto(data.nombre, '........................................');
  const rol = limpiarTexto(data.rol, 'Docente');
  const escuela = limpiarTexto(data.escuela, '........................................');
  const distrito = limpiarTexto(data.distrito, '........................................');
  const motivo = limpiarTexto(data.motivo, 'situación a considerar');
  const detalle = limpiarTexto(data.detalle, 'Se deja constancia de la situación detallada por la persona interesada, quedando pendiente completar los datos específicos antes de su presentación.');

  const esActa = data.tipoDocumento.startsWith('acta_');

  if (esActa) {
    return `${cfg.titulo.toUpperCase()}\n\n${lugarFecha}\n\nEn la institución ${escuela}, distrito de ${distrito}, se deja constancia de que ${nombre}, en su carácter de ${rol}, informa la siguiente situación:\n\n${detalle}\n\nMotivo/objeto del acta: ${motivo}.\n\nEn virtud de lo expuesto, ${cfg.pedido}\n\nLeída que fue la presente, y para constancia, se firma al pie en el lugar y fecha indicados.\n\nFirma: ........................................\nAclaración: ${nombre}\nDNI/CUIL: ........................................\n\nObservaciones: ........................................`;
  }

  return `${lugarFecha}\n\n${destinatario}\nS/D\n\nRef.: ${motivo}\n\n${tonoIntro(data.tono)}, en mi carácter de ${rol}, perteneciente a ${escuela}, distrito de ${distrito}.\n\nQuien suscribe, ${nombre}, expone la siguiente situación:\n\n${detalle}\n\nPor lo expuesto, ${cfg.pedido}\n\nSin otro particular, saludo atentamente.\n\nFirma: ........................................\nAclaración: ${nombre}\nDNI/CUIL: ........................................\nTel./correo de contacto: ........................................`;
}

function prepararIdea() {
  const rol = limpiarTexto($('ideaRol').value, 'Docente');
  const idea = limpiarTexto($('ideaTexto').value, '');
  const contacto = limpiarTexto($('ideaContacto').value, 'Sin contacto informado');
  if (!idea) {
    $('ideaMsg').textContent = 'Escribí primero la idea o problema a resolver.';
    return '';
  }
  const texto = `Idea para APDocentePBA Herramientas\n\nRol: ${rol}\nContacto: ${contacto}\n\nProblema / herramienta necesaria:\n${idea}`;
  $('ideaMsg').textContent = 'Idea preparada. Podés copiarla o compartirla por WhatsApp.';
  return texto;
}

function copiarAlPortapapeles(texto) {
  if (!texto.trim()) return;
  navigator.clipboard?.writeText(texto).then(() => {
    $('estadoResultado').textContent = 'Copiado';
    $('estadoResultado').classList.add('ok');
  }).catch(() => {
    $('resultado').select();
    document.execCommand('copy');
  });
}

$('docenteForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const data = {
    tipoDocumento: $('tipoDocumento').value,
    nombre: $('nombre').value,
    rol: $('rol').value,
    escuela: $('escuela').value,
    distrito: $('distrito').value,
    destinatario: $('destinatario').value,
    motivo: $('motivo').value,
    detalle: $('detalle').value,
    tono: $('tono').value,
    localidadFecha: $('localidadFecha').value
  };
  $('resultado').value = generarDocumento(data);
  $('estadoResultado').textContent = 'Borrador generado';
  $('estadoResultado').classList.add('ok');
  localStorage.setItem('apd_tools_last_doc', $('resultado').value);
});

$('btnCopiar').addEventListener('click', () => copiarAlPortapapeles($('resultado').value));

$('btnImprimir').addEventListener('click', () => {
  const texto = $('resultado').value.trim();
  if (!texto) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Documento generado</title><style>body{font-family:Arial,sans-serif;line-height:1.55;padding:42px;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${texto.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></body></html>`);
  w.document.close();
  w.print();
});

$('btnLimpiar').addEventListener('click', () => {
  $('docenteForm').reset();
  $('resultado').value = '';
  $('estadoResultado').textContent = 'Listo para probar';
  $('estadoResultado').classList.remove('ok');
});

$('ideasForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const texto = prepararIdea();
  if (texto) navigator.clipboard?.writeText(texto);
});

$('btnCompartirIdea').addEventListener('click', () => {
  const texto = prepararIdea();
  if (!texto) return;
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
});

const lastDoc = localStorage.getItem('apd_tools_last_doc');
if (lastDoc) {
  $('resultado').value = lastDoc;
  $('estadoResultado').textContent = 'Último borrador recuperado';
}
