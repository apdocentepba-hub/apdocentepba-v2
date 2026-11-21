"use strict";
/* Deterministic local demonstration. No API calls or personal data. */
const DEMO_OFFERS=Object.freeze([
 Object.freeze({id:"DEMO-APD-001",cargo:"Preceptor/a",distrito:"Avellaneda",
  nivel:"Secundaria",turno:"Mañana",escuela:"Escuela ficticia A",fecha:"Ejemplo de publicación"}),
 Object.freeze({id:"DEMO-APD-002",cargo:"Informática",distrito:"Quilmes",
  nivel:"Técnica",turno:"Tarde",escuela:"Escuela ficticia B",fecha:"Ejemplo de publicación"}),
 Object.freeze({id:"DEMO-APD-003",cargo:"Matemática",distrito:"Lomas de Zamora",
  nivel:"Secundaria",turno:"Mañana",escuela:"Escuela ficticia C",fecha:"Ejemplo de publicación"}),
 Object.freeze({id:"DEMO-APD-004",cargo:"Informática",distrito:"Avellaneda",
  nivel:"Técnica",turno:"Tarde",escuela:"Escuela ficticia D",fecha:"Ejemplo de publicación"})
]);
const DISTRICTS=Object.freeze(["Todos","Avellaneda","Quilmes","Lomas de Zamora"]);
const SHIFTS=Object.freeze(["Todos","Mañana","Tarde"]);
const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
function filterDemoOffers(offers,{query="",district="Todos",shift="Todos"}={}){
 if(!Array.isArray(offers))return [];
 const needle=normalize(query);
 return offers.filter(o=>
  o&&(!needle||[o.cargo,o.distrito,o.escuela,o.nivel].some(v=>normalize(v).includes(needle)))&&
  (district==="Todos"||o.distrito===district)&&
  (shift==="Todos"||o.turno===shift)
 );
}
function toggleSaved(ids,id){
 if(!DEMO_OFFERS.some(o=>o.id===id))return Array.isArray(ids)?[...ids]:[];
 const set=new Set(Array.isArray(ids)?ids:[]);
 if(set.has(id))set.delete(id);else set.add(id);
 return [...set];
}
function demoCounters(offers,saved){
 return {matching:Array.isArray(offers)?offers.length:0,
 saved:new Set(Array.isArray(saved)?saved:[]).size,pushReceived:0};
}
module.exports={DEMO_OFFERS,DISTRICTS,SHIFTS,filterDemoOffers,toggleSaved,demoCounters};
