/* Safe source-name lookup candidate. Disabled by default; no production writes.
 * Never guess CAPITAN SARMIENTO == CORONEL SARMIENTO.
 */
export function apdSourceDistrictForCatalog(name) {
  const key=String(name||"").toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
  const sourceNames={
    "MATANZA":"LA MATANZA",
    "LAS HERAS":"GENERAL LAS HERAS",
    "NUEVE DE JULIO":"9 DE JULIO",
    "GENERAL LAMADRID":"GENERAL LA MADRID",
    "HIPOLITO YRIGOYEN":"HIPOLITO IRIGOYEN",
    "JUAREZ":"BENITO JUAREZ"
  };
  return Object.prototype.hasOwnProperty.call(sourceNames,key)
    ? sourceNames[key] : String(name||"");
}
