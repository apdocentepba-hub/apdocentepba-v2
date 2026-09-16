import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node scripts/patch-live-offer-identity-bundle.mjs <input> <output>');
let source = fs.readFileSync(input, 'utf8');

const getStart = source.indexOf('function getOfferId(offer) {');
if (getStart < 0) throw new Error('getOfferId start not found');
const getEndMarker = '__name(getOfferId, "getOfferId");';
const getEnd = source.indexOf(getEndMarker, getStart);
if (getEnd < 0) throw new Error('getOfferId end marker not found');
if (source.indexOf('function getOfferId(offer) {', getStart + 1) >= 0) throw new Error('multiple getOfferId functions found');

const oldGetBlock = source.slice(getStart, getEnd + getEndMarker.length);
if (!/offer\.offer_id\s*\|\|\s*offer\.id/.test(oldGetBlock)) {
  throw new Error('getOfferId no longer matches vulnerable live shape');
}

const newGetBlock = `function canonicalOfferIdentity(offer) {
  const detailRaw = String(offer?.iddetalle || offer?.raw?.iddetalle || "").trim();
  if (detailRaw) return \`D_\${detailRaw.replace(/^D_/i, "")}\`;
  const sourceKey = String(offer?.source_offer_key || offer?.raw?.source_offer_key || "").trim();
  if (/^[DO]_/i.test(sourceKey)) return sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
  const explicitOfferId = String(offer?.offer_id || "").trim();
  if (/^[DO]_/i.test(explicitOfferId)) return explicitOfferId.charAt(0).toUpperCase() + explicitOfferId.slice(1);
  const ofertaRaw = String(offer?.idoferta || offer?.raw?.idoferta || "").trim();
  if (ofertaRaw) return \`O_\${ofertaRaw.replace(/^O_/i, "")}\`;
  if (sourceKey) return sourceKey;
  return String(explicitOfferId || offer?.id || offer?.codigo || offer?.identity_key || "").trim();
}
__name(canonicalOfferIdentity, "canonicalOfferIdentity");
function getOfferId(offer) {
  return canonicalOfferIdentity(offer);
}
__name(getOfferId, "getOfferId");`;
source = source.slice(0, getStart) + newGetBlock + source.slice(getEnd + getEndMarker.length);

const normStart = source.indexOf('function normalizeOfferPayload(offer) {');
if (normStart < 0) throw new Error('normalizeOfferPayload not found');
const normWindowEnd = Math.min(source.length, normStart + 7000);
let normWindow = source.slice(normStart, normWindowEnd);
const identityPattern = /offer_id:\s*String\(\s*offer\.offer_id\s*\|\|\s*offer\.idoferta\s*\|\|\s*offer\.id\s*\|\|\s*offer\.identity_key\s*\|\|\s*offer\.codigo\s*\|\|\s*['"]{2}\s*\)\.trim\(\),\s*source_offer_key:\s*offer\.source_offer_key\s*\|\|\s*["']{2},/;
const match = normWindow.match(identityPattern);
if (!match) throw new Error('normalizeOfferPayload vulnerable identity block not found');
if ((normWindow.match(new RegExp(identityPattern.source, 'g')) || []).length !== 1) throw new Error('normalize identity block count != 1');
normWindow = normWindow.replace(identityPattern, 'offer_id: canonicalOfferIdentity(offer), source_offer_key: canonicalOfferIdentity(offer),');
source = source.slice(0, normStart) + normWindow + source.slice(normWindowEnd);

if (source.includes(oldGetBlock)) throw new Error('old getOfferId block remains');
if (!source.includes('offer_id: canonicalOfferIdentity(offer), source_offer_key: canonicalOfferIdentity(offer),')) throw new Error('canonical normalize block missing');

fs.writeFileSync(output, source);
console.log('live offer identity patch applied');
