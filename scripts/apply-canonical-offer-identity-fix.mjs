import fs from 'node:fs';

const path = new URL('../worker.js', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

const oldGetOfferId = `function getOfferId(offer) {
  return String(
    offer.offer_id ||
    offer.id ||
    offer.codigo ||
    offer.identity_key ||
    ''
  ).trim();
}`;

const newGetOfferId = `function canonicalOfferIdentity(offer) {
  const detailRaw = String(offer?.iddetalle || offer?.raw?.iddetalle || '').trim();
  if (detailRaw) {
    return \`D_\${detailRaw.replace(/^D_/i, '')}\`;
  }

  const sourceKey = String(offer?.source_offer_key || offer?.raw?.source_offer_key || '').trim();
  if (/^[DO]_/i.test(sourceKey)) {
    return sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
  }

  const explicitOfferId = String(offer?.offer_id || '').trim();
  if (/^[DO]_/i.test(explicitOfferId)) {
    return explicitOfferId.charAt(0).toUpperCase() + explicitOfferId.slice(1);
  }

  const ofertaRaw = String(offer?.idoferta || offer?.raw?.idoferta || '').trim();
  if (ofertaRaw) {
    return \`O_\${ofertaRaw.replace(/^O_/i, '')}\`;
  }

  if (sourceKey) return sourceKey;

  return String(
    explicitOfferId ||
    offer?.id ||
    offer?.codigo ||
    offer?.identity_key ||
    ''
  ).trim();
}

function getOfferId(offer) {
  return canonicalOfferIdentity(offer);
}`;

const oldPayloadIdentity = `    offer_id: String(
      offer.offer_id ||
      offer.idoferta ||
      offer.id ||
      offer.identity_key ||
      offer.codigo ||
      ''
    ).trim(),

    source_offer_key: offer.source_offer_key || "",`;

const newPayloadIdentity = `    offer_id: canonicalOfferIdentity(offer),

    source_offer_key: canonicalOfferIdentity(offer),`;

function replaceExactlyOnce(haystack, needle, replacement, label) {
  const first = haystack.indexOf(needle);
  if (first === -1) throw new Error(`${label}: target not found`);
  if (haystack.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`${label}: target appears more than once`);
  }
  return haystack.replace(needle, replacement);
}

source = replaceExactlyOnce(source, oldGetOfferId, newGetOfferId, 'getOfferId');
source = replaceExactlyOnce(source, oldPayloadIdentity, newPayloadIdentity, 'normalizeOfferPayload identity');

fs.writeFileSync(path, source);
console.log('canonical offer identity patch applied');
