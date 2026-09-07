(() => {
  const lista = window.AP_DOCENTE_HERRAMIENTAS || [];
  const calc = lista.find((x) => x.id === 'calculadora-haberes-docentes');
  if (calc) {
    calc.icono = '🧮';
    calc.categoria = 'Haberes';
    calc.titulo = 'Calculadora de haberes docentes';
    calc.descripcion = 'Estimador orientativo de bruto, descuentos y neto docente PBA con nivel, cargo, antigüedad, ruralidad, zona fría, módulos, horas o cargos.';
    calc.url = './calculadora-haberes-docentes.html';
    calc.estado = 'Activo';
    calc.destacado = true;
    calc.tags = ['haberes','calculadora','sueldo docente','recibo','neto','bruto','descuentos','ips','ioma','fonid','conectividad','zona fria','ruralidad','modulos','horas catedra','cargo docente','antiguedad','couli','mis haberes','reclamo'];
  }

  const control = lista.find((x) => x.id === 'control-recibo-haberes');
  if (control) {
    control.descripcion = 'Control simple de recibo docente: compara neto cobrado, referencia esperada, descuentos, deudas, retroactivos y genera informe prudente.';
    control.tags = ['haberes','recibo','control recibo','me pagaron bien','sueldo','neto','descuento','deuda','retroactivo','mis haberes','liquidacion','comparador','reclamo'];
  }
})();
