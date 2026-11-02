/* Insigne LAB: reglas específicas, prototipo aislado.
 * NO reemplaza el matcher de producción ni el contrato de los planes.
 * Sólo reconoce emergencias si la oferta trae una clasificación EXPLÍCITA.
 */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ normalDistricts: 3, emergencyDistricts: 1, rules: 20 });
  const norm = v => String(v == null ? '' : v).trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  const plain = v => norm(v).replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const acronym = v => (norm(v).match(/\(([^)]+)\)/) || [,''])[1].replace(/\s+/g,'');
  function cargoMatches(want, actual) {
    if (!norm(want) || !norm(actual)) return false;
    const a = acronym(want), b = acronym(actual);
    if (a && b && a === b) return true;
    return plain(want) !== '' && plain(want) === plain(actual);
  }
  // No inferir "emergencia" de un texto de descripción, "urgente" o
  // campos ausentes: sólo de campos explícitos de clasificación.
  function offerEmergency(offer) {
    if (offer?.isEmergency === true || offer?.es_emergencia === true) return true;
    const type = norm(offer?.classification || offer?.tipo_oferta || offer?.tipo_designacion || '');
    return ['EMERGENCIA', '108B_EMERGENCIA', '108B EMERGENCIA'].includes(type);
  }
  function validate(rules) {
    if (!Array.isArray(rules) || rules.length > LIMITS.rules)
      return { ok:false, reason:'Se permiten hasta 20 búsquedas específicas en este prototipo.' };
    const normal = new Set(), extra = new Set(), seen=new Set();
    for (const rule of rules) {
      const district=norm(rule?.district), cargo=norm(rule?.cargo);
      const mode=rule?.mode;
      if (!district || !cargo || !['normal','emergency'].includes(mode))
        return { ok:false, reason:'Cada búsqueda requiere distrito, cargo y modalidad válida.' };
      const key=[district,cargo,mode].join('|');
      if (seen.has(key)) return { ok:false, reason:'Ya agregaste esa combinación.' };
      seen.add(key);
      if (mode==='normal') normal.add(district);
    }
    if (normal.size > LIMITS.normalDistricts)
      return { ok:false, reason:'La propuesta admite como máximo 3 distritos habituales.' };
    for (const rule of rules) {
      const district=norm(rule.district);
      if (rule.mode==='emergency' && !normal.has(district)) extra.add(district);
    }
    if (extra.size > LIMITS.emergencyDistricts)
      return { ok:false, reason:'La propuesta admite 1 distrito adicional únicamente para emergencias.' };
    return { ok:true, normalDistricts:normal.size, emergencyExtra:extra.size, rules:rules.length };
  }
  function matches(offer, rules) {
    const checked=validate(rules);
    if(!checked.ok) return {valid:false, reason:checked.reason, matches:[]};
    const district=norm(offer?.district || offer?.descdistrito || offer?.distrito);
    const cargo=offer?.cargo || offer?.descripcioncargo || offer?.materia || offer?.descripcionarea || '';
    const hits=rules.filter(rule =>
      norm(rule.district)===district &&
      cargoMatches(rule.cargo,cargo) &&
      (rule.mode!=='emergency' || offerEmergency(offer))
    );
    return {valid:true, isEmergency:offerEmergency(offer), matches:hits};
  }
  root.APD_InsigneLab = Object.freeze({ LIMITS, norm, cargoMatches, offerEmergency, validate, matches });
})(typeof globalThis !== 'undefined' ? globalThis : this);
