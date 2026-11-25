// Read-only projection for alerts. Saved preferences are never mutated here.
export function effectiveCommercialPreferences(saved,resolved,active){
 const code=String(resolved?.subscription?.plan_code||'').trim().toUpperCase();
 if(!['FREE','TRIAL_14D','COMPLETO'].includes(code))return saved;
 if(active!==true||String(resolved?.plan?.code||'').toUpperCase()!==code)throw Error('Unverified commercial entitlement');
 if(!saved)return saved;
 const full=code!=='FREE',maxDistricts=full?5:1,maxCargos=full?10:1;
 if(Number(resolved.plan.max_distritos)!==maxDistricts||Number(resolved.plan.max_cargos)!==maxCargos)throw Error('Commercial preference limits mismatch');
 const unique=values=>{const seen=new Set();return values.filter(v=>{if(typeof v!=='string'||!v.trim())return false;const key=v.trim().toUpperCase();if(seen.has(key))return false;seen.add(key);return true;});};
 const arr=v=>Array.isArray(v)?v:[];
 const districts=unique([saved.distrito_principal,...arr(saved.otros_distritos)]).slice(0,maxDistricts);
 const cargos=unique([...arr(saved.cargos),...arr(saved.materias)]).slice(0,maxCargos);
 return {...saved,distrito_principal:districts[0]||null,otros_distritos:districts.slice(1),cargos,materias:[],
  alertas_activas:!!saved.alertas_activas&&districts.length>0&&cargos.length>0,
  alertas_whatsapp:full&&!!saved.alertas_whatsapp};
}
