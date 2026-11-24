/** Pure reminder planning. Never sends or schedules messages. */
const hour=3600000;
export function planFavoriteDeadlineReminder({favorite,consent,now,deadline,sourceVerifiedAt,alreadyClaimed=[]}={}){
 if(consent!==true||favorite?.status!=='open'||favorite?.stillSaved!==true)return null;
 const key=favorite.key;
 if(typeof key!=='string'||!key.length||key.length>160||/[^A-Za-z0-9_.:|-]/.test(key))return null;
 if(![now,deadline,sourceVerifiedAt].every(Number.isSafeInteger)||sourceVerifiedAt>now||now-sourceVerifiedAt>hour||deadline<=now)return null;
 const remaining=deadline-now;
 const band=remaining<=2*hour?'2h':remaining<=24*hour?'24h':null;
 if(!band)return null;
 const id=JSON.stringify([key,deadline,band]);
 if(!Array.isArray(alreadyClaimed)||alreadyClaimed.includes(id))return null;
 return {key,deadline,band,id};
}
