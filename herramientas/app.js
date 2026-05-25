const $ = (id) => document.getElementById(id);

const gruposDocumento = [
  {
    label: 'Notas y reclamos',
    items: [
      ['nota_directivo', 'Nota a directivo'],
      ['nota_sad', 'Nota a SAD'],
      ['reclamo_haberes', 'Reclamo por haberes'],
      ['reclamo_situacion_revista', 'Reclamo por situación de revista'],
      ['solicitud_rectificacion', 'Solicitud de rectificación'],
      ['pedido_constancia', 'Pedido de constancia'],
      ['descargo_docente', 'Descargo docente'],
      ['comunicacion_familia', 'Comunicación a familia']
    ]
  },
  {
    label: 'Actas escolares',
    items: [
      ['acta_recepcion_documentacion', 'Acta de recepción de documentación'],
      ['acta_devolucion', 'Acta de devolución'],
      ['acta_toma_posesion', 'Acta de toma de posesión'],
      ['acta_cese_docente', 'Acta de cese docente'],
      ['acta_continuidad_servicios', 'Acta de continuidad de servicios'],
      ['acta_reunion', 'Acta de reunión'],
      ['acta_notificacion', 'Acta de notificación']
    ]
  },
  {
    label: 'Aula y trayectoria',
    items: [
      ['informe_pedagogico', 'Informe pedagógico individual'],
      ['informe_grupal', 'Informe grupal'],
      ['planificacion_breve', 'Planificación breve'],
      ['secuencia_didactica', 'Secuencia didáctica'],
      ['rubrica_evaluacion', 'Rúbrica de evaluación'],
      ['trabajo_intensificacion', 'Trabajo de intensificación']
    ]
  },
  {
    label: 'Secretaría escolar',
    items: [
      ['checklist_legajo_docente', 'Checklist de legajo docente'],
      ['checklist_licencia_cobertura', 'Checklist licencia/cobertura'],
      ['guia_suna_pdd', 'Guía rápida SUNA/PDD'],
      ['registro_tramite', 'Registro de trámite administrativo']
    ]
  }
];

const tipos = {
  nota_directivo: {
    titulo: 'Nota a directivo',
    modo: 'nota',
    encabezado: 'A la Dirección de la institución',
    pedido: 'solicito se tenga a bien considerar la situación planteada y arbitrar los medios que correspondan.',
    checklist: ['Datos personales completos', 'Escuela y distrito', 'Motivo concreto', 'Documentación respaldatoria', 'Copia para archivo personal']
  },
  nota_sad: {
    titulo: 'Nota a SAD',
    modo: 'nota',
    encabezado: 'A la Secretaría de Asuntos Docentes',
    pedido: 'solicito se tenga a bien recepcionar la presente y orientar o intervenir según corresponda.',
    checklist: ['DNI/CUIL', 'Designación o constancia vinculada', 'Escuela y distrito', 'Capturas o documentación respaldatoria', 'Correo o canal de contacto']
  },
  reclamo_haberes: {
    titulo: 'Reclamo por haberes',
    modo: 'nota',
    encabezado: 'A quien corresponda',
    pedido: 'solicito se revise la situación informada respecto de la liquidación de haberes y se indique el curso administrativo correspondiente.',
    checklist: ['Recibo de haberes', 'Alta o designación', 'Fechas reclamadas', 'Captura de sistema si corresponde', 'Detalle claro de la diferencia detectada']
  },
  reclamo_situacion_revista: {
    titulo: 'Reclamo por situación de revista',
    modo: 'nota',
    encabezado: 'A quien corresponda',
    pedido: 'solicito la revisión de mi situación de revista y la actualización o rectificación que corresponda en los sistemas pertinentes.',
    checklist: ['Designación', 'Toma de posesión si corresponde', 'Captura de ABC/PDD/SUNA si corresponde', 'Fecha desde la que debería impactar', 'Copia de comunicaciones previas']
  },
  solicitud_rectificacion: {
    titulo: 'Solicitud de rectificación',
    modo: 'nota',
    encabezado: 'A quien corresponda',
    pedido: 'solicito se rectifique la información indicada, dejando constancia de la documentación que acompaña la presente.',
    checklist: ['Dato incorrecto', 'Dato correcto', 'Prueba documental', 'Fecha de detección', 'Organismo o área donde figura el error']
  },
  pedido_constancia: {
    titulo: 'Pedido de constancia',
    modo: 'nota',
    encabezado: 'A quien corresponda',
    pedido: 'solicito se expida la constancia correspondiente o se indique el procedimiento para obtenerla.',
    checklist: ['Tipo de constancia', 'Destino de la constancia', 'Datos personales', 'Cargo o función', 'Fecha o período requerido']
  },
  descargo_docente: {
    titulo: 'Descargo docente',
    modo: 'nota',
    encabezado: 'A quien corresponda',
    pedido: 'presento el presente descargo a fin de dejar constancia de mi versión de los hechos y solicitar que sea incorporado a las actuaciones correspondientes.',
    checklist: ['Hechos en orden cronológico', 'Fechas y horarios', 'Personas intervinientes', 'Documentación o testigos si corresponde', 'Pedido concreto de incorporación al expediente/actuación']
  },
  comunicacion_familia: {
    titulo: 'Comunicación a familia',
    modo: 'nota',
    encabezado: 'A la familia',
    pedido: 'se solicita tomar conocimiento de la presente comunicación y, de corresponder, acercarse a la institución o responder por los canales habituales.',
    checklist: ['Nombre del estudiante', 'Curso/año', 'Motivo comunicado', 'Canal de respuesta', 'Fecha límite si corresponde']
  },
  acta_recepcion_documentacion: {
    titulo: 'Acta de recepción de documentación',
    modo: 'acta',
    pedido: 'se deja constancia de la recepción de la documentación indicada, quedando sujeta a revisión administrativa por las autoridades correspondientes.',
    checklist: ['Detalle de documentos recibidos', 'Fecha de recepción', 'Firma y aclaración', 'Observaciones', 'Copia para archivo']
  },
  acta_devolucion: {
    titulo: 'Acta de devolución',
    modo: 'acta',
    pedido: 'se deja constancia de la devolución realizada y de las observaciones asentadas en la presente.',
    checklist: ['Elemento o documentación devuelta', 'Estado al momento de devolución', 'Motivo', 'Firma de quien entrega', 'Firma de quien recibe']
  },
  acta_toma_posesion: {
    titulo: 'Acta de toma de posesión',
    modo: 'acta',
    pedido: 'se deja constancia de la toma de posesión, quedando asentada la información para los registros institucionales correspondientes.',
    checklist: ['Designación', 'Declaración jurada si corresponde', 'Fecha y horario de desempeño efectivo', 'Cargo/módulos/horas', 'Registro en altas y bajas']
  },
  acta_cese_docente: {
    titulo: 'Acta de cese docente',
    modo: 'acta',
    pedido: 'se deja constancia del cese informado y de la comunicación realizada a las áreas correspondientes.',
    checklist: ['Causal del cese', 'Fecha efectiva', 'Situación de revista', 'Notificación al docente', 'Carga o comunicación en sistemas correspondientes']
  },
  acta_continuidad_servicios: {
    titulo: 'Acta de continuidad de servicios',
    modo: 'acta',
    pedido: 'se deja constancia del ofrecimiento de continuidad de servicios y de la respuesta expresada por la persona interesada.',
    checklist: ['Licencia o ausencia que origina continuidad', 'Docente suplente', 'Acepta o rechaza', 'Período', 'Comunicación a SAD si corresponde']
  },
  acta_reunion: {
    titulo: 'Acta de reunión',
    modo: 'acta',
    pedido: 'se deja constancia de los temas tratados, acuerdos alcanzados y tareas pendientes.',
    checklist: ['Asistentes', 'Temario', 'Acuerdos', 'Responsables', 'Fecha de seguimiento']
  },
  acta_notificacion: {
    titulo: 'Acta de notificación',
    modo: 'acta',
    pedido: 'se deja constancia de que la persona indicada ha sido notificada del contenido informado en la presente.',
    checklist: ['Contenido notificado', 'Fecha', 'Persona notificada', 'Firma o constancia de negativa', 'Archivo institucional']
  },
  informe_pedagogico: {
    titulo: 'Informe pedagógico individual',
    modo: 'informe',
    pedido: 'se sugiere continuar acompañando la trayectoria con intervenciones acordes a las necesidades observadas.',
    checklist: ['Datos del estudiante', 'Curso y materia', 'Fortalezas', 'Dificultades', 'Estrategias implementadas', 'Recomendaciones']
  },
  informe_grupal: {
    titulo: 'Informe grupal',
    modo: 'informe',
    pedido: 'se propone sostener acuerdos de trabajo institucional y estrategias de acompañamiento grupal.',
    checklist: ['Curso/división', 'Características generales', 'Clima de trabajo', 'Avances', 'Dificultades', 'Acciones sugeridas']
  },
  planificacion_breve: {
    titulo: 'Planificación breve',
    modo: 'planificacion',
    pedido: 'la propuesta podrá ajustarse según el diagnóstico del grupo y los acuerdos institucionales.',
    checklist: ['Año/materia', 'Tema', 'Propósitos', 'Contenidos', 'Actividades', 'Evaluación', 'Recursos']
  },
  secuencia_didactica: {
    titulo: 'Secuencia didáctica',
    modo: 'planificacion',
    pedido: 'la secuencia queda abierta a adecuaciones según tiempos reales de clase y trayectoria del grupo.',
    checklist: ['Inicio', 'Desarrollo', 'Cierre', 'Evaluación', 'Recursos', 'Intervenciones docentes']
  },
  rubrica_evaluacion: {
    titulo: 'Rúbrica de evaluación',
    modo: 'rubrica',
    pedido: 'la rúbrica debe ajustarse a los criterios institucionales y a la propuesta efectivamente enseñada.',
    checklist: ['Criterios', 'Niveles de desempeño', 'Indicadores observables', 'Escala', 'Devolución al estudiante']
  },
  trabajo_intensificacion: {
    titulo: 'Trabajo de intensificación',
    modo: 'planificacion',
    pedido: 'la propuesta busca recuperar saberes priorizados mediante actividades claras, progresivas y evaluables.',
    checklist: ['Saberes priorizados', 'Consignas graduadas', 'Ayudas', 'Criterios de acreditación', 'Instancia de defensa oral si corresponde']
  },
  checklist_legajo_docente: {
    titulo: 'Checklist de legajo docente',
    modo: 'checklist',
    pedido: 'se recomienda verificar la documentación obrante y registrar faltantes para su actualización.',
    checklist: ['Ficha de datos personales', 'DNI', 'Títulos', 'Designación', 'Declaración jurada', 'Licencias', 'Asistencia anual', 'Calificaciones', 'Actas u observaciones']
  },
  checklist_licencia_cobertura: {
    titulo: 'Checklist licencia/cobertura',
    modo: 'checklist',
    pedido: 'se recomienda verificar el tipo de licencia, período, documentación y necesidad de cobertura antes de avanzar.',
    checklist: ['Tipo de licencia', 'Fecha desde/hasta', 'Documentación respaldatoria', 'Cargo/módulos afectados', 'Necesidad de cobertura', 'Sistema a actualizar', 'Comunicación interna']
  },
  guia_suna_pdd: {
    titulo: 'Guía rápida SUNA/PDD',
    modo: 'checklist',
    pedido: 'esta guía orientativa ayuda a no olvidar pasos, pero debe contrastarse con instructivos vigentes y criterios institucionales.',
    checklist: ['Identificar novedad', 'Reunir documentación', 'Procesar en SUNA si corresponde', 'Actualizar PDD si corresponde', 'Guardar constancias', 'Informar a SAD o autoridad si corresponde']
  },
  registro_tramite: {
    titulo: 'Registro de trámite administrativo',
    modo: 'checklist',
    pedido: 'se sugiere conservar un seguimiento escrito del trámite hasta su resolución.',
    checklist: ['Fecha de inicio', 'Motivo', 'Área o destinatario', 'Documentación enviada', 'Respuesta recibida', 'Próximo paso', 'Fecha de seguimiento']
  }
};

function limpiarTexto(valor, fallback = '') {
  return (valor || '').trim() || fallback;
}

function escaparHTML(texto) {
  return String(texto || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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

function configurarOpcionesDocumento() {
  const select = $('tipoDocumento');
  if (!select) return;
  const valorActual = select.value || 'nota_directivo';
  select.innerHTML = '';
  gruposDocumento.forEach((grupo) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = grupo.label;
    grupo.items.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
  if (tipos[valorActual]) select.value = valorActual;
}

function datosFormulario() {
  return {
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
}

function datosBase(data, cfg) {
  return {
    cfg,
    lugarFecha: limpiarTexto(data.localidadFecha, 'Lugar y fecha: ........................................'),
    destinatario: limpiarTexto(data.destinatario, cfg.encabezado || 'A quien corresponda'),
    nombre: limpiarTexto(data.nombre, '........................................'),
    rol: limpiarTexto(data.rol, 'Docente'),
    escuela: limpiarTexto(data.escuela, '........................................'),
    distrito: limpiarTexto(data.distrito, '........................................'),
    motivo: limpiarTexto(data.motivo, 'situación a considerar'),
    detalle: limpiarTexto(data.detalle, 'Se deja constancia de la situación detallada por la persona interesada, quedando pendiente completar los datos específicos antes de su presentación.')
  };
}

function bloqueChecklist(cfg) {
  const items = cfg.checklist || [];
  if (!items.length) return '';
  return `\n\nCHECKLIST SUGERIDO PARA REVISAR ANTES DE ENVIAR\n${items.map((item) => `□ ${item}`).join('\n')}`;
}

function versionBreve(data, base, cfg) {
  return `\n\nVERSIÓN BREVE PARA WHATSAPP O EMAIL\nHola. Comparto una solicitud vinculada a: ${base.motivo}. Soy ${base.nombre}, ${base.rol}, de ${base.escuela}, distrito ${base.distrito}. El detalle principal es: ${base.detalle}. Quedo atento/a a la orientación o respuesta correspondiente. Gracias.`;
}

function generarActa(base) {
  return `${base.cfg.titulo.toUpperCase()}\n\n${base.lugarFecha}\n\nEn la institución ${base.escuela}, distrito de ${base.distrito}, se deja constancia de que ${base.nombre}, en su carácter de ${base.rol}, informa la siguiente situación:\n\n${base.detalle}\n\nMotivo/objeto del acta: ${base.motivo}.\n\nEn virtud de lo expuesto, ${base.cfg.pedido}\n\nLeída que fue la presente, y para constancia, se firma al pie en el lugar y fecha indicados.\n\nFirma: ........................................\nAclaración: ${base.nombre}\nDNI/CUIL: ........................................\n\nObservaciones: ........................................`;
}

function generarNota(data, base) {
  return `${base.lugarFecha}\n\n${base.destinatario}\nS/D\n\nRef.: ${base.motivo}\n\n${tonoIntro(data.tono)}, en mi carácter de ${base.rol}, perteneciente a ${base.escuela}, distrito de ${base.distrito}.\n\nQuien suscribe, ${base.nombre}, expone la siguiente situación:\n\n${base.detalle}\n\nPor lo expuesto, ${base.cfg.pedido}\n\nSin otro particular, saludo atentamente.\n\nFirma: ........................................\nAclaración: ${base.nombre}\nDNI/CUIL: ........................................\nTel./correo de contacto: ........................................`;
}

function generarInforme(base) {
  return `${base.cfg.titulo.toUpperCase()}\n\n${base.lugarFecha}\n\nInstitución: ${base.escuela}\nDistrito: ${base.distrito}\nElaborado por: ${base.nombre}\nRol: ${base.rol}\n\nMotivo del informe:\n${base.motivo}\n\nDescripción de la situación / trayectoria:\n${base.detalle}\n\nFortalezas observadas:\n- ........................................\n- ........................................\n\nDificultades o aspectos a acompañar:\n- ........................................\n- ........................................\n\nEstrategias implementadas o sugeridas:\n- ........................................\n- ........................................\n\nCierre:\n${base.cfg.pedido}\n\nFirma y aclaración:\n${base.nombre}`;
}

function generarPlanificacion(base) {
  return `${base.cfg.titulo.toUpperCase()}\n\n${base.lugarFecha}\n\nInstitución: ${base.escuela}\nDistrito: ${base.distrito}\nDocente / rol: ${base.nombre} - ${base.rol}\n\nTema / eje:\n${base.motivo}\n\nFundamentación breve:\n${base.detalle}\n\nPropósitos:\n- ........................................\n- ........................................\n\nContenidos / saberes priorizados:\n- ........................................\n- ........................................\n\nActividades propuestas:\nInicio:\n- ........................................\n\nDesarrollo:\n- ........................................\n\nCierre:\n- ........................................\n\nCriterios de evaluación:\n- Participación y compromiso con la tarea.\n- Resolución de consignas propuestas.\n- Comunicación clara de procedimientos, ideas o conclusiones.\n\nRecursos:\n- Carpeta, material impreso o digital, pizarra y otros recursos disponibles.\n\nObservación:\n${base.cfg.pedido}`;
}

function generarRubrica(base) {
  return `${base.cfg.titulo.toUpperCase()}\n\n${base.lugarFecha}\n\nInstitución: ${base.escuela}\nDistrito: ${base.distrito}\nDocente / rol: ${base.nombre} - ${base.rol}\n\nActividad, tema o desempeño a evaluar:\n${base.motivo}\n\nDescripción:\n${base.detalle}\n\nCRITERIOS E INDICADORES\n\n1. Comprensión del contenido\nMB: Comprende y aplica con autonomía.\nB: Comprende lo central y resuelve con pequeñas ayudas.\nR: Requiere acompañamiento frecuente.\nM: No evidencia aún los saberes esperados.\n\n2. Resolución de consignas\nMB: Resuelve consignas completas y justifica.\nB: Resuelve la mayoría de las consignas.\nR: Resuelve parcialmente.\nM: Presenta producción insuficiente o incompleta.\n\n3. Comunicación del proceso\nMB: Explica con claridad procedimientos o ideas.\nB: Comunica procedimientos básicos.\nR: Explica con dificultad.\nM: No logra comunicar el proceso realizado.\n\nObservación:\n${base.cfg.pedido}`;
}

function generarChecklist(base) {
  return `${base.cfg.titulo.toUpperCase()}\n\n${base.lugarFecha}\n\nInstitución: ${base.escuela}\nDistrito: ${base.distrito}\nResponsable / rol: ${base.nombre} - ${base.rol}\n\nMotivo o caso a controlar:\n${base.motivo}\n\nDetalle inicial:\n${base.detalle}\n\nCONTROL DE PASOS\n${(base.cfg.checklist || []).map((item) => `□ ${item}`).join('\n')}\n\nSeguimiento:\n□ Se informó a quien corresponde.\n□ Se guardó copia de la documentación.\n□ Se registró fecha de próximo control.\n□ Se verificó resolución o respuesta.\n\nObservación:\n${base.cfg.pedido}`;
}

function generarDocumento(data) {
  const cfg = tipos[data.tipoDocumento] || tipos.nota_directivo;
  const base = datosBase(data, cfg);
  let cuerpo;

  if (cfg.modo === 'acta') cuerpo = generarActa(base);
  else if (cfg.modo === 'informe') cuerpo = generarInforme(base);
  else if (cfg.modo === 'planificacion') cuerpo = generarPlanificacion(base);
  else if (cfg.modo === 'rubrica') cuerpo = generarRubrica(base);
  else if (cfg.modo === 'checklist') cuerpo = generarChecklist(base);
  else cuerpo = generarNota(data, base);

  if (cfg.modo !== 'checklist') cuerpo += bloqueChecklist(cfg);
  if (['nota', 'informe', 'planificacion', 'rubrica'].includes(cfg.modo)) cuerpo += versionBreve(data, base, cfg);
  cuerpo += '\n\nAVISO: este texto es un borrador orientativo. Revisá datos, normativa, fechas, cargos, destinatarios y criterios institucionales antes de usarlo.';

  return cuerpo;
}

function historialActual() {
  try { return JSON.parse(localStorage.getItem('apd_tools_history') || '[]'); }
  catch { return []; }
}

function guardarHistorial(tipo, texto) {
  const cfg = tipos[tipo] || tipos.nota_directivo;
  const item = {
    fecha: new Date().toLocaleString('es-AR'),
    titulo: cfg.titulo,
    texto
  };
  const historial = [item, ...historialActual()].slice(0, 8);
  localStorage.setItem('apd_tools_history', JSON.stringify(historial));
  renderHistorial();
}

function renderHistorial() {
  const cont = $('historialDocs');
  if (!cont) return;
  const historial = historialActual();
  if (!historial.length) {
    cont.innerHTML = '<p class="small-note">Todavía no hay borradores guardados en este dispositivo.</p>';
    return;
  }
  cont.innerHTML = historial.map((item, idx) => `
    <button type="button" class="history-item" data-history-index="${idx}">
      <strong>${escaparHTML(item.titulo)}</strong>
      <span>${escaparHTML(item.fecha)}</span>
    </button>
  `).join('');
  cont.querySelectorAll('[data-history-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = historial[Number(btn.dataset.historyIndex)];
      if (!item) return;
      $('resultado').value = item.texto;
      $('estadoResultado').textContent = 'Borrador recuperado';
      $('estadoResultado').classList.add('ok');
    });
  });
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
  localStorage.setItem('apd_tools_last_idea', texto);
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

function descargarWord() {
  const texto = $('resultado').value.trim();
  if (!texto) return;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Documento generado</title><style>body{font-family:Arial,sans-serif;line-height:1.55;color:#111;padding:32px}h1{font-size:20px}</style></head><body><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escaparHTML(texto)}</pre></body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `documento-docente-${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function instalarBotonesExtra() {
  const imprimir = $('btnImprimir');
  if (!imprimir || $('btnWord')) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-soft';
  btn.type = 'button';
  btn.id = 'btnWord';
  btn.textContent = 'Descargar Word';
  btn.addEventListener('click', descargarWord);
  imprimir.insertAdjacentElement('afterend', btn);

  const resultCard = document.querySelector('.result-card');
  if (resultCard && !$('historialDocs')) {
    const box = document.createElement('div');
    box.className = 'history-box';
    box.innerHTML = '<h4>Últimos borradores en este dispositivo</h4><div id="historialDocs"></div>';
    resultCard.appendChild(box);
  }
}

function instalarEventos() {
  $('docenteForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = datosFormulario();
    const texto = generarDocumento(data);
    $('resultado').value = texto;
    $('estadoResultado').textContent = 'Borrador generado';
    $('estadoResultado').classList.add('ok');
    localStorage.setItem('apd_tools_last_doc', texto);
    guardarHistorial(data.tipoDocumento, texto);
  });

  $('btnCopiar').addEventListener('click', () => copiarAlPortapapeles($('resultado').value));

  $('btnImprimir').addEventListener('click', () => {
    const texto = $('resultado').value.trim();
    if (!texto) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Documento generado</title><style>body{font-family:Arial,sans-serif;line-height:1.55;padding:42px;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${escaparHTML(texto)}</pre></body></html>`);
    w.document.close();
    w.print();
  });

  $('btnLimpiar').addEventListener('click', () => {
    $('docenteForm').reset();
    configurarOpcionesDocumento();
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
}

function recuperarEstado() {
  const lastDoc = localStorage.getItem('apd_tools_last_doc');
  if (lastDoc) {
    $('resultado').value = lastDoc;
    $('estadoResultado').textContent = 'Último borrador recuperado';
  }
  renderHistorial();
}

configurarOpcionesDocumento();
instalarBotonesExtra();
instalarEventos();
recuperarEstado();
