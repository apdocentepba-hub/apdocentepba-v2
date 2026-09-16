import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
const start = worker.indexOf('function mapMercadoPagoSubscriptionStatus');
const end = worker.indexOf('function addDaysIso', start);
assert.ok(start >= 0 && end > start, 'Mercado Pago status mapping functions must exist in canonical Worker');
const snippet = worker.slice(start, end);
const factory = new Function(`const __name = (target) => target;\n${snippet}\nreturn { mapMercadoPagoSubscriptionStatus, mapMercadoPagoCheckoutStatus };`);
const { mapMercadoPagoSubscriptionStatus: mapSubscription, mapMercadoPagoCheckoutStatus: mapCheckout } = factory();

const cases = [
  ['APPROVED', 'ACTIVE', 'approved'],
  ['PENDING', 'PENDING', 'pending'],
  ['IN_PROCESS', 'PENDING', 'pending'],
  ['PENDING_CONTINGENCY', 'PENDING', 'pending'],
  ['REJECTED', 'CANCELLED', 'rejected'],
  ['CANCELLED', 'CANCELLED', 'cancelled'],
  ['EXPIRED', 'EXPIRED', 'expired']
];

for (const [providerStatus, subscriptionStatus, checkoutStatus] of cases) {
  assert.equal(mapSubscription(providerStatus), subscriptionStatus, `${providerStatus} subscription mapping`);
  assert.equal(mapCheckout(providerStatus), checkoutStatus, `${providerStatus} checkout mapping`);
}

console.log('Mercado Pago status mapping contract: OK');
