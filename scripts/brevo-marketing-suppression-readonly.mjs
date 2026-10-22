// Read-only Brevo marketing suppression check. No contact creation, no send.
// Eligibility never implies consent: the APDocente verified consent record is a separate gate.
export async function readBrevoMarketingStatus(email, config={}) {
  const address=String(email||'').trim().toLowerCase();
  const key=String(config.apiKey||'').trim();
  const approvedListId=Number(config.approvedListId||0);
  const sendRequest=config.fetchImpl||fetch;
  if(!key || !Number.isSafeInteger(approvedListId) || approvedListId<=0)
    return {status:'unknown', reason:'configuration_missing'};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return {status:'unknown',reason:'invalid_address'};
  let response;
  try {
    response=await sendRequest('https://api.brevo.com/v3/contacts/'+encodeURIComponent(address), {
      method:'GET', redirect:'error',
      headers:{'api-key':key,'accept':'application/json'},
      signal:AbortSignal.timeout(9000)
    });
  } catch {
    return {status:'unknown',reason:'provider_unavailable'};
  }
  if(response.status===404)return {status:'unknown',reason:'not_in_brevo'};
  if(!response.ok)return {status:'unknown',reason:'provider_error'};
  let contact;
  try {contact=await response.json();}catch{
    return {status:'unknown',reason:'invalid_provider_response'};
  }
  if(contact?.emailBlacklisted===true)
    return {status:'blocked',reason:'provider_blacklisted'};
  if(Array.isArray(contact?.listUnsubscribed) &&
     contact.listUnsubscribed.map(Number).includes(approvedListId))
    return {status:'blocked',reason:'list_unsubscribed'};
  if(contact?.emailBlacklisted!==false)
    return {status:'unknown',reason:'missing_provider_status'};
  if(!Array.isArray(contact?.listIds) ||
     !contact.listIds.map(Number).includes(approvedListId))
    return {status:'unknown',reason:'no_confirmed_list_membership'};
  // Provider status only: the local double-opt-in evidence remains mandatory.
  return {status:'eligible',reason:'provider_not_blocked_in_verified_list'};
}
export function canSendMarketing({local,provider,subscriptionActive=false,manualException=false,
  previouslySent=false}={}) {
  return !!local && local.status==='subscribed' && local.confirmed_at != null &&
    !!local.consent_version &&
    local.provider_status==='eligible' &&
    provider?.status==='eligible' &&
    !subscriptionActive && !manualException && !previouslySent;
}
