// Preserve inaccessible saved settings while editing the visible free-plan fields.
// Does not change entitlement, activate channels or send alerts.
export function preserveFreePreferences(clean,saved){
 if(!clean||typeof clean!=='object')throw Error('Invalid preferences');
 if(saved===null)return clean;
 if(!saved||typeof saved!=='object')throw Error('Unverified saved preferences');
 const arr=v=>Array.isArray(v)?v:[];
 const key=v=>typeof v==='string'?v.trim().toUpperCase():'';
 const distinct=items=>{const seen=new Set();return items.filter(v=>{const k=key(v);if(!k||seen.has(k))return false;seen.add(k);return true;});};
 const oldDistricts=distinct([saved.distrito_principal,...arr(saved.otros_distritos)]);
 const oldCargos=distinct([...arr(saved.cargos),...arr(saved.materias)]);
 const district=clean.distrito_principal;
 const cargo=distinct(arr(clean.cargos))[0];
 // Reject clearing a visible slot if doing so would silently promote a hidden slot.
 if((!key(district)&&oldDistricts.length>1)||(!key(cargo)&&oldCargos.length>1))throw Error('Seleccioná un distrito y un cargo para conservar tus filtros anteriores.');
 return {...clean,
  otros_distritos:distinct([district,...oldDistricts.slice(1)]).slice(key(district)?1:0),
  cargos:distinct([cargo,...oldCargos.slice(1)]),
  materias:[],
  alertas_whatsapp:!!saved.alertas_whatsapp,
  alertas_telegram:typeof saved.alertas_telegram==='boolean'?saved.alertas_telegram:!!clean.alertas_telegram,
  _plan_ajuste:{...clean._plan_ajuste,retained_hidden_preferences:true}
 };
}
