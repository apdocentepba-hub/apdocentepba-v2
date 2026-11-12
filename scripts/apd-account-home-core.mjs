/**
 * Account-level private home reference. Shared pure validation for
 * frontend and backend candidate. Does not fetch, store or log anything.
 */
export function sanitizeAccountHome(payload) {
 if (!payload || typeof payload !== 'object' || Array.isArray(payload))
  throw Error('Datos de domicilio inválidos');
 const address_text=String(payload.address_text??'').trim();
 if (address_text.length<5 || address_text.length>180 ||
     /[<>\r\n\u0000-\u001f]/.test(address_text))
  throw Error('Ingresá calle y altura (máximo 180 caracteres)');
 const raw=payload.georef;
 if (raw===null || raw===undefined) return {address_text,georef:null};
 if (!raw || typeof raw!=='object' || Array.isArray(raw) ||
     raw.source!=='GEOREF_AR_V2') throw Error('Ubicación inválida');
 const label=String(raw.label??'').trim();
 const lat=Number(raw.lat),lon=Number(raw.lon),height=Number(raw.height);
 if (label!==address_text || label.length<8 ||
     !Number.isFinite(lat) || !Number.isFinite(lon) ||
     lat< -56 || lat> -21 || lon< -74 || lon> -53 ||
     !Number.isSafeInteger(height) || height<1 || height>99999)
  throw Error('Ubicación inconsistente con el domicilio');
 const scope=raw.scope??'exacta';
 if (!['exacta','partido','provincia','pais'].includes(scope))
  throw Error('Alcance de georreferencia inválido');
 if (scope!=='exacta' && raw.reviewed!==true)
  throw Error('Confirmá en el mapa las ubicaciones aproximadas');
 return {address_text,georef:{source:'GEOREF_AR_V2',label,lat,lon,height,
  scope,...(raw.reviewed===true?{reviewed:true}:{})}};
}
