/** Statutory component calculator, NOT a complete gross or net payroll.
 * Ley 10579 art.33 and Decreto 2485/92 art.36.
 * No default basic salary, no conversion of school area into salary class.
 */
export const SOURCES=Object.freeze({
 seniority:'https://test.normas.gba.gob.ar/documentos/71LMqSkJ.html',
 disadvantage:'https://test.normas.gba.gob.ar/documentos/6RKG2Lun.html'
});
const thresholds=Object.freeze([[0,0],[1,10],[2,20],[4,30],[7,40],[10,50],[12,60],[15,70],[17,80],[20,100],[22,110],[24,120]]);
export function seniorityPercent(years){
 if(!Number.isInteger(years)||years<0||years>80)throw Error('Antigüedad reconocida inválida');
 return thresholds.filter(([minimum])=>years>=minimum).at(-1)[1];
}
const classes=Object.freeze({NORMAL:0,I:30,II:60,III:90,IV:100,V:120});
export function disadvantagePercent(confirmedLegalClass){
 // Raw catalog strings (including '0', 'Rural', U0) are not a confirmed legal class.
 return typeof confirmedLegalClass==='string'&&Object.hasOwn(classes,confirmedLegalClass)?classes[confirmedLegalClass]:null;
}
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000000;
export function statutoryComponents({recognizedYears,monthlyAssignmentCentavos,confirmedLegalClass=null,confirmedDisadvantageBaseCentavos=null}){
 const rate=seniorityPercent(recognizedYears);
 if(!amount(monthlyAssignmentCentavos))throw Error('Asignación mensual inválida');
 const seniority=Math.round(monthlyAssignmentCentavos*rate/100);
 const disadvantageRate=disadvantagePercent(confirmedLegalClass);
 if(confirmedDisadvantageBaseCentavos!==null&&!amount(confirmedDisadvantageBaseCentavos))throw Error('Base de desfavorabilidad inválida');
 const disadvantage=disadvantageRate===null?null:disadvantageRate===0?0:confirmedDisadvantageBaseCentavos===null?null:Math.round(confirmedDisadvantageBaseCentavos*disadvantageRate/100);
 return {status:'partial',assignmentCentavos:monthlyAssignmentCentavos,seniorityPercent:rate,seniorityCentavos:seniority,disadvantagePercent:disadvantageRate,disadvantageCentavos:disadvantage,knownSubtotalCentavos:monthlyAssignmentCentavos+seniority+(disadvantage??0),netCentavos:null,grossCentavos:null,missing:['Otros adicionales','Topes por docente','Descuentos','Asignaciones familiares',...(disadvantage===null?['Desfavorabilidad sin importe confirmado']:[])]};
}

/** SUTEBA's public scope notes identify caps, not a complete multi-cargo formula.
 * Report review requirements; never silently zero a component or conflate units.
 */
export function payrollCapReview(profile){
 if(!Array.isArray(profile?.positions)||profile.positions.length>42)throw Error('Perfil inválido');
 const totals={cargo:0,modulo:0,hora_catedra:0};
 for(const p of profile.positions){
  if(!Object.hasOwn(totals,p?.kind)||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>77||(p.kind==='cargo'&&p.quantity!==1))throw Error('Cantidad remunerativa inválida');
  totals[p.kind]+=p.quantity;
 }
 const warnings=[];
 if(totals.cargo>2)warnings.push({id:'cargo-cap',text:'Más de dos cargos: revisar topes de adicionales según la función.',codes:['0438','0455','2761','0629','0668']});
 if(totals.modulo>20||totals.hora_catedra>30)warnings.push({id:'teaching-cap',text:'Superás 20 módulos o 30 horas cátedra: revisar adicionales sujetos a tope.',codes:['0455','0667','2751']});
 if(Object.values(totals).filter(v=>v>0).length>1)warnings.push({id:'mixed-units',text:'Combinación de unidades remunerativas: revisar equivalencias y topes conjuntos.',codes:[]});
 return {totals,warnings,source:'https://haberes.suteba.org.ar/app/',automaticDeduction:false};
}
