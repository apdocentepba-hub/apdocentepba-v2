/**
 * APDocentePBA: account-bound private SQL inbox repository, LAB ONLY.
 *
 * The HTTP handler supplies only its verified server-side actor.
 * No account identifier, RPC access token or push token is accepted
 * from the user's query/body. Not imported by production Worker or mobile.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function userOf(actor){
 if(!actor||Object.keys(actor).length!==2||
    actor.sessionVerified!==true||
    typeof actor.userId!=='string'||!UUID.test(actor.userId))
  throw Error('inbox_actor_not_verified');
 return actor.userId;
}
export function createMobileInboxPostgrestRepositoryLab({database}={}){
 if(typeof database?.inboxPageLab!=='function'||
    typeof database?.inboxAckReadLab!=='function')
  throw Error('missing_inbox_private_database');
 return Object.freeze({
  async listPage({actor,after=0,limit=5}={}){
   const userId=userOf(actor);
   return database.inboxPageLab({userId,after,limit});
  },
  async acknowledgeRead({actor,id,revision}={}){
   const userId=userOf(actor);
   return database.inboxAckReadLab({userId,id,revision});
  }
 });
}
