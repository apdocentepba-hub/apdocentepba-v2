// Offline candidate: deny user_id-only access to Telegram/WhatsApp account state.
// No production Worker, DB or deployment writes.
import fs from 'node:fs';
import path from 'node:path';

export function hardenMessagingStatus(workerSource) {
  let source=workerSource;
  const oldFragment=[
    '  let user = authUser;',
    '  if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);',
    '  if (!user?.id) {'
  ].join('\n');
  const newFragment=[
    '  // Private messaging status must never be authorized using a supplied user_id.',
    '  // The server-issued Bearer session is mandatory for every status read.',
    '  const user = authUser;',
    '  if (!user?.id) {'
  ].join('\n');
  const occurrences=source.split(oldFragment).length-1;
  if(occurrences!==2) throw Error('Expected exactly Telegram and WhatsApp status patterns; refusing unknown Worker source');
  const tgStart=source.indexOf('async function handleTelegramStatus(request, env) {');
  const waStart=source.indexOf('async function handleWhatsAppStatus(request, env) {');
  if(tgStart<0||waStart<0)throw Error('Messaging status handlers missing');
  // Replace only inside those two bounded handlers, not unrelated endpoints.
  for(const [fn,nextMarker] of [
    ['handleTelegramStatus','__name(handleTelegramStatus,'],
    ['handleWhatsAppStatus','__name(handleWhatsAppStatus,']
  ]) {
    const start=source.indexOf('async function '+fn+'(request, env) {');
    const end=source.indexOf('\n'+nextMarker,start);
    if(start<0||end<start)throw Error('Cannot bound '+fn);
    const body=source.slice(start,end);
    if(body.split(oldFragment).length!==2)throw Error('Unexpected status auth pattern in '+fn);
    source=source.slice(0,start)+body.replace(oldFragment,newFragment)+source.slice(end);
  }
  return source;
}

if (process.argv[1] && import.meta.url.endsWith('/'+path.basename(process.argv[1]))) {
  const input='worker-live/worker_hotfix.js';
  const output='tmp/messaging-auth-candidate/worker_hotfix.js';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,hardenMessagingStatus(fs.readFileSync(input,'utf8')));
  console.log('Isolated messaging status authorization candidate created, without live changes.');
}
