/* Capability-scoped readiness for the Job Agent.

   The defect this replaces: readiness was scoped to the whole Job Agent, so an
   unconfigured employer-browser budget disabled resume tailoring, and a policy
   bundle written for consequential external actions gated internal drafting.

   The boundary that matters is not "Job Agent vs not". It is:

     INTERNAL  - happens inside the user's own workspace with their own data.
                 Nothing is transmitted to a third party on their behalf.
     EXTERNAL  - acts on the outside world in the user's name.

   Everything EXTERNAL keeps every control it has today. Nothing here weakens
   employer interaction, application submission, counsel gates, consent
   enforcement or monetary controls. Unconfigured capabilities still fail closed;
   they now fail closed with a capability-specific reason instead of a global one. */

import {
  jobAgentMonetaryBudgetConfiguration,
  jobAgentMonetarySpendRequired,
  jobAgentCategoryBudgetReadiness,
} from './job-agent-spend-ledger.js';

export const JOB_AGENT_CAPABILITIES = Object.freeze({
  DISCOVERY: 'DISCOVERY',
  ANALYSIS: 'ANALYSIS',
  DOCUMENT_GENERATION: 'DOCUMENT_GENERATION',
  TRACKING: 'TRACKING',
  SCHEDULED_DISCOVERY: 'SCHEDULED_DISCOVERY',
  EXTERNAL_INTERACTION: 'EXTERNAL_INTERACTION',
  APPLICATION_SUBMISSION: 'APPLICATION_SUBMISSION',
});

/* policy levels
     none          - no Job Agent policy bundle. Pre-existing product behaviour
                     already covered by the site's counsel-approved terms and
                     privacy notice (terms.html / privacy.html, both digest-pinned).
     authorization - the user must have authorised the agent to act unattended.
     external      - authorization plus counsel approval and recorded evidence.
                     UNCHANGED from today. */
const DEFINITIONS = Object.freeze({
  DISCOVERY: Object.freeze({
    spendCategories: Object.freeze([]),
    policy: 'none', external: false,
    description: 'Read public employer feeds and re-verify a listing at its source.',
  }),
  ANALYSIS: Object.freeze({
    spendCategories: Object.freeze(['ai']),
    policy: 'none', external: false,
    description: 'Fit scoring, job intelligence, career positioning.',
  }),
  DOCUMENT_GENERATION: Object.freeze({
    spendCategories: Object.freeze(['ai', 'application-package', 'document-render']),
    policy: 'none', external: false,
    description: 'Tailored resumes, cover letters, application drafts, PDF/DOCX render.',
  }),
  TRACKING: Object.freeze({
    spendCategories: Object.freeze([]),
    policy: 'none', external: false,
    description: 'Saved jobs, application pipeline, receipts, outcomes.',
  }),
  SCHEDULED_DISCOVERY: Object.freeze({
    spendCategories: Object.freeze(['ai']),
    policy: 'authorization', external: false,
    description: 'Background search that runs while the user is away.',
  }),
  EXTERNAL_INTERACTION: Object.freeze({
    spendCategories: Object.freeze(['employer-browser']),
    policy: 'external', external: true,
    description: 'Interacting with an employer system, short of final submission.',
  }),
  APPLICATION_SUBMISSION: Object.freeze({
    spendCategories: Object.freeze(['employer-browser']),
    policy: 'external', external: true,
    description: 'Submitting an application in the user’s name.',
  }),
});

export function jobAgentCapabilityDefinition(capability) {
  return DEFINITIONS[capability] || null;
}

export function jobAgentCapabilityCategories(capability) {
  const definition = DEFINITIONS[capability];
  return definition ? definition.spendCategories.slice() : [];
}

export function jobAgentCapabilityIsExternal(capability) {
  const definition = DEFINITIONS[capability];
  return definition ? definition.external === true : true; // unknown is treated as external
}

/* Readiness for one capability.
   `category` narrows the check to the single spend category an operation will
   actually reserve, so a capability that can touch several categories is not
   blocked by one it is not using on this call. */
export function jobAgentCapabilityReadiness(capability, { env = process.env, category } = {}) {
  const definition = DEFINITIONS[capability];
  if (!definition) {
    return { ok: false, status: 500, capability: capability || null, code: 'CAPABILITY_UNKNOWN', reason: 'capability-unknown' };
  }

  const categories = category ? [category] : definition.spendCategories;
  if (categories.length === 0) return { ok: true, capability, spendRequired: false, categories: [] };

  if (category && !definition.spendCategories.includes(category)) {
    return { ok: false, status: 500, capability, category, code: 'CAPABILITY_CATEGORY_MISMATCH', reason: 'category-not-declared-for-capability' };
  }

  const budget = jobAgentMonetaryBudgetConfiguration(env);
  if (!jobAgentMonetarySpendRequired(env, budget)) {
    return { ok: true, capability, spendRequired: false, categories };
  }

  for (const item of categories) {
    const readiness = jobAgentCategoryBudgetReadiness(budget, item);
    if (!readiness.ok) {
      return {
        ok: false, status: 503, capability, category: item,
        code: `${capability}_NOT_CONFIGURED`,
        reason: readiness.reason,
      };
    }
  }
  return { ok: true, capability, spendRequired: true, categories };
}

/* Operator-facing summary. Reports each capability independently so one
   unconfigured capability is visibly not a global outage. */
export function jobAgentCapabilityReport(env = process.env) {
  return Object.fromEntries(Object.keys(DEFINITIONS).map(capability => {
    const readiness = jobAgentCapabilityReadiness(capability, { env });
    const definition = DEFINITIONS[capability];
    return [capability, {
      ok: readiness.ok,
      code: readiness.ok ? null : readiness.code,
      reason: readiness.ok ? null : readiness.reason,
      blockingCategory: readiness.ok ? null : (readiness.category || null),
      policy: definition.policy,
      external: definition.external,
      spendCategories: definition.spendCategories.slice(),
      description: definition.description,
    }];
  }));
}
