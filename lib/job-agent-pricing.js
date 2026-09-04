// Single source of truth for the Job Agent price.
//
// Setting a price is NOT the same as being able to charge it. This module records the
// decided price so every surface quotes one number, and deliberately reports that billing
// is off: there is no Job Agent checkout, no Stripe price, and no code path that creates a
// charge. `lib/job-agent-entitlement.js` independently hardcodes
// `dedicatedBillingEnabled: false` / `createsCharges: false`.
//
// Before this price can actually be charged, all of the following must be true:
//   1. Counsel-approved consent policy is live (JOB_AGENT_COUNSEL_APPROVED + the three
//      policy versions). Until then a user cannot even grant consent, so the agent
//      cannot run at all.
//   2. Private object storage is configured, or package generation, document rendering,
//      artifact download, and account export all remain fail-closed.
//   3. A Job Agent checkout and its webhook entitlement path exist and are reviewed.
// Charging before 1 and 2 would be billing for a product that cannot function.

export const JOB_AGENT_PRICE = Object.freeze({
  schemaVersion: 1,
  currency: 'USD',
  monthlyCents: 3900,
  displayMonthly: '$39',
  cadence: 'month',
  decidedOn: '2026-08-31',

  // Hard off-switches. Flipping these is a deliberate, reviewed change, never a side effect.
  billingEnabled: false,
  createsCharges: false,
  checkoutConfigured: false,

  availability: 'controlled-beta-invite-paced',
});

export function jobAgentPriceDisplay() {
  return `${JOB_AGENT_PRICE.displayMonthly}/${JOB_AGENT_PRICE.cadence}`;
}

/**
 * Public, content-free description for client surfaces. Never implies a charge is
 * available while billing is off.
 */
export function publicJobAgentPricing() {
  return {
    schemaVersion: JOB_AGENT_PRICE.schemaVersion,
    currency: JOB_AGENT_PRICE.currency,
    monthlyCents: JOB_AGENT_PRICE.monthlyCents,
    display: jobAgentPriceDisplay(),
    billingEnabled: JOB_AGENT_PRICE.billingEnabled,
    availability: JOB_AGENT_PRICE.availability,
  };
}
