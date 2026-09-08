// The Job Agent price is decided ($39/month) but must not be chargeable until the
// product actually functions. These assertions pin the number and, more importantly,
// keep billing fail-closed so it cannot be switched on as a side effect of another change.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JOB_AGENT_PRICE, UNIFIED_PAID_PLAN, jobAgentPriceDisplay, publicJobAgentPricing } from '../lib/job-agent-pricing.js';
import { jobAgentEntitlementConfiguration, jobAgentEntitlementsForSubscription } from '../lib/job-agent-entitlement.js';

// ── 1. The decided price ─────────────────────────────────────────────────────
assert.equal(JOB_AGENT_PRICE.monthlyCents, 3900, 'The Job Agent price is $39/month.');
assert.equal(JOB_AGENT_PRICE, UNIFIED_PAID_PLAN, 'The Job Agent must use the unified paid plan.');
assert.equal(JOB_AGENT_PRICE.planName, '1stStep Complete');
assert.equal(JOB_AGENT_PRICE.entitlementTier, 'complete');
assert.deepEqual(JOB_AGENT_PRICE.includedProducts, [
  'resume-builder', 'cover-letters', 'application-tracker', 'resume-vault', 'chrome-extension-workflow', 'job-agent',
]);
assert.equal(JOB_AGENT_PRICE.currency, 'USD');
assert.equal(JOB_AGENT_PRICE.cadence, 'month');
assert.equal(jobAgentPriceDisplay(), '$39/month');

// ── 2. Billing is fail-closed ────────────────────────────────────────────────
assert.equal(JOB_AGENT_PRICE.billingEnabled, false, 'Job Agent billing must stay off until the product can actually run.');
assert.equal(JOB_AGENT_PRICE.createsCharges, false);
assert.equal(JOB_AGENT_PRICE.checkoutConfigured, false);

// The entitlement policy is an independent second gate. Both must say no.
for (const env of [
  {},
  { JOB_AGENT_ACCESS_POLICY_VERSION: 'policy-v1', JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete' },
]) {
  const entitlement = jobAgentEntitlementConfiguration(env);
  assert.equal(entitlement.dedicatedBillingEnabled, false, 'Dedicated Job Agent billing must remain disabled regardless of policy configuration.');
  assert.equal(entitlement.createsCharges, false, 'The entitlement policy must never create a charge.');
}

// ── 3. The public shape never advertises a purchasable price ─────────────────
const pub = publicJobAgentPricing();
assert.equal(pub.monthlyCents, 3900);
assert.equal(pub.display, '$39/month');
assert.equal(pub.planName, '1stStep Complete');
assert.equal(pub.entitlementTier, 'complete');
assert.ok(pub.includedProducts.includes('resume-builder'));
assert.ok(pub.includedProducts.includes('job-agent'));
assert.equal(pub.billingEnabled, false);
assert.equal(pub.availability, 'early-access-invite-paced');
assert.equal(Object.hasOwn(pub, 'checkoutUrl'), false, 'No checkout URL may be exposed while billing is off.');
assert.equal(Object.hasOwn(pub, 'stripePriceId'), false);

// ── 4. No Stripe checkout wiring exists for the Job Agent ────────────────────
// If someone adds one, this test should fail so the review is deliberate.
const pricingLib = await readFile(new URL('../lib/job-agent-pricing.js', import.meta.url), 'utf8');
for (const forbidden of [/price_[A-Za-z0-9]{6,}/, /buy\.stripe\.com/, /checkout\.stripe\.com/, /stripe\.checkout/i]) {
  assert.equal(forbidden.test(pricingLib), false, `The pricing module must contain no Stripe checkout wiring (${forbidden}).`);
}

// ── 5. Public copy states the price truthfully ───────────────────────────────
// It must name the price AND say nothing is being charged yet, so a reader cannot
// conclude the Job Agent is currently a paid, available product.
const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const appClient = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const pricing = await readFile(new URL('../pricing.html', import.meta.url), 'utf8');
const concierge = await readFile(new URL('../concierge.html', import.meta.url), 'utf8');
assert.match(homepage, /\$39\/month/, 'The homepage must state the decided price.');
assert.match(homepage, /1stStep Complete/, 'The homepage must name the unified membership.');
assert.match(homepage, /nothing is charged yet|Nothing is being charged/i, 'The homepage must say the Job Agent is not being charged for yet.');
assert.match(homepage, /no paid checkout/i, 'The homepage must be explicit that no checkout exists.');
assert.equal(/guarantee[sd]? (?:you )?(?:a |an )?(?:interview|offer|job)/i.test(homepage), false, 'Pricing copy must not promise an outcome.');

for (const [name, source] of [['resume workspace', app], ['resume client', appClient], ['pricing page', pricing], ['Job Agent', concierge]]) {
  assert.match(source, /1stStep Complete/, `${name} must use the unified membership name.`);
  assert.doesNotMatch(source, /\$24\.99|Job Hunt Pass/, `${name} must not advertise the retired separate plan.`);
}
assert.match(app, /Resume tailoring and cover letters/);
assert.match(app, /Job discovery and application preparation/);
assert.match(pricing, /One membership\. Every 1stStep tool\./);
assert.deepEqual(jobAgentEntitlementsForSubscription({
  client: 'job-agent',
  tier: UNIFIED_PAID_PLAN.entitlementTier,
  env: {
    JOB_AGENT_ACCESS_POLICY_VERSION: 'early-access-v1',
    JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete',
  },
}), ['job-agent-controlled-beta'], 'The same complete tier must be eligible for the gated Job Agent grant.');

console.log('1stStep Complete: one $39/month plan covers resume tools and Job Agent, legacy access remains compatible, and billing stays fail-closed.');
