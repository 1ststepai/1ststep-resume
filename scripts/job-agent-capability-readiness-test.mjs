import assert from 'node:assert/strict';
import {
  JOB_AGENT_CAPABILITIES,
  jobAgentCapabilityReadiness,
  jobAgentCapabilityDefinition,
  jobAgentCapabilityReport,
} from '../lib/job-agent-capabilities.js';
import { jobAgentCategoryBudgetReadiness, jobAgentMonetaryBudgetConfiguration } from '../lib/job-agent-spend-ledger.js';

const C = JOB_AGENT_CAPABILITIES;

// Production-shaped environment. Every global prerequisite satisfied.
const base = {
  VERCEL_ENV: 'production',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-value-for-tests-0123456789',
  RATE_LIMIT_HASH_SECRET: 'x'.repeat(40),
  JOB_AGENT_MONETARY_BUDGET_ENABLED: 'true',
  JOB_AGENT_MONETARY_BUDGET_APPROVED: 'true',
  JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION: 'budget-v1',
  JOB_AGENT_MONETARY_BUDGET_CURRENCY: 'USD',
  JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS: '5000',
};
const documentGeneration = {
  JOB_AGENT_AI_DAILY_BUDGET_CENTS: '3000', JOB_AGENT_AI_MAX_REQUEST_CENTS: '50',
  JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS: '2000', JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS: '100',
  JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS: '500', JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS: '10',
};
const employerBrowser = {
  JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS: '2000', JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS: '50',
};

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log('  PASS  ' + name); };

// ── A. document generation works while employer-browser is unconfigured ──────
check('A · DOCUMENT_GENERATION ready while EXTERNAL_INTERACTION budget is absent', () => {
  const env = { ...base, ...documentGeneration }; // employer-browser deliberately absent
  const readiness = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'ai' });
  assert.equal(readiness.ok, true, 'resume generation must work');
  assert.equal(readiness.spendRequired, true, 'spend control must still be enforced');
  const all = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env });
  assert.equal(all.ok, true, 'all declared document categories are configured');
});

// ── B. document generation fails closed when its own budget is absent ────────
check('B · DOCUMENT_GENERATION fails closed when unconfigured', () => {
  const readiness = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env: { ...base }, category: 'ai' });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.status, 503);
  assert.equal(readiness.code, 'DOCUMENT_GENERATION_NOT_CONFIGURED');
  assert.equal(readiness.category, 'ai');
});

// ── C. employer interaction fails closed when unconfigured ───────────────────
check('C · EXTERNAL_INTERACTION fails closed when unconfigured', () => {
  const env = { ...base, ...documentGeneration }; // document budgets present, employer-browser absent
  const readiness = jobAgentCapabilityReadiness(C.EXTERNAL_INTERACTION, { env });
  assert.equal(readiness.ok, false, 'employer interaction must NOT be unlocked by this change');
  assert.equal(readiness.code, 'EXTERNAL_INTERACTION_NOT_CONFIGURED');
  assert.equal(readiness.category, 'employer-browser');
});

// ── D. application submission fails closed and stays externally gated ────────
check('D · APPLICATION_SUBMISSION fails closed and remains an external capability', () => {
  const env = { ...base, ...documentGeneration };
  const readiness = jobAgentCapabilityReadiness(C.APPLICATION_SUBMISSION, { env });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.code, 'APPLICATION_SUBMISSION_NOT_CONFIGURED');
  const definition = jobAgentCapabilityDefinition(C.APPLICATION_SUBMISSION);
  assert.equal(definition.external, true, 'submission must remain external');
  assert.equal(definition.policy, 'external', 'submission must keep counsel + authorization + evidence');
});

// ── E. internal drafting survives an absent counsel bundle ───────────────────
check('E · missing counsel bundle does not block internal drafting', () => {
  const env = { ...base, ...documentGeneration };
  // No JOB_AGENT_COUNSEL_APPROVED, no TERMS/PRIVACY/AUTHORIZATION versions at all.
  assert.equal(env.JOB_AGENT_COUNSEL_APPROVED, undefined);
  assert.equal(jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'ai' }).ok, true);
  assert.equal(jobAgentCapabilityReadiness(C.ANALYSIS, { env, category: 'ai' }).ok, true);
  assert.equal(jobAgentCapabilityReadiness(C.DISCOVERY, { env }).ok, true);
  assert.equal(jobAgentCapabilityReadiness(C.TRACKING, { env }).ok, true);
  // and the external capabilities still declare the counsel-bearing policy level
  assert.equal(jobAgentCapabilityDefinition(C.EXTERNAL_INTERACTION).policy, 'external');
  assert.equal(jobAgentCapabilityDefinition(C.SCHEDULED_DISCOVERY).policy, 'authorization');
});

// ── F. missing monetary approval fails that category closed ──────────────────
check('F · absent monetary approval fails the category closed', () => {
  const env = { ...base, ...documentGeneration, JOB_AGENT_MONETARY_BUDGET_APPROVED: 'false' };
  const readiness = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'ai' });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.reason, 'monetary-budget-not-approved');
  const disabled = jobAgentCapabilityReadiness(C.ANALYSIS, { env: { ...env, JOB_AGENT_MONETARY_BUDGET_ENABLED: 'false' }, category: 'ai' });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.reason, 'monetary-budget-disabled');
});

// ── G. one unavailable category does not disable unrelated categories ────────
check('G · an unavailable category does not globally disable the others', () => {
  // employer-browser present but INVALID (per-request cap exceeds its daily cap)
  const env = {
    ...base, ...documentGeneration, ...employerBrowser,
    JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS: '9000',
  };
  const budget = jobAgentMonetaryBudgetConfiguration(env);
  assert.equal(budget.ready, false, 'global readiness still reports the invalid category');
  assert.equal(jobAgentCategoryBudgetReadiness(budget, 'ai').ok, true, 'ai category unaffected');
  assert.equal(jobAgentCategoryBudgetReadiness(budget, 'employer-browser').ok, false, 'bad category still closed');
  assert.equal(jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'ai' }).ok, true);
  assert.equal(jobAgentCapabilityReadiness(C.EXTERNAL_INTERACTION, { env }).ok, false);
});

// ── extra: production always enforces spend; unknown capability fails closed ──
check('H · production enforces spend even when the enable flag is absent', () => {
  const env = { ...base, ...documentGeneration };
  delete env.JOB_AGENT_MONETARY_BUDGET_ENABLED;
  const readiness = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'ai' });
  assert.equal(readiness.ok, false, 'must not become permissive when the flag is simply missing');
  assert.equal(readiness.reason, 'monetary-budget-disabled');
});

check('I · unknown capability and mismatched category fail closed', () => {
  const env = { ...base, ...documentGeneration };
  const unknown = jobAgentCapabilityReadiness('ANYTHING_ELSE', { env });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'CAPABILITY_UNKNOWN');
  const mismatch = jobAgentCapabilityReadiness(C.DOCUMENT_GENERATION, { env, category: 'employer-browser' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'CAPABILITY_CATEGORY_MISMATCH');
});

check('J · capability report is per-capability, not global', () => {
  const env = { ...base, ...documentGeneration };
  const report = jobAgentCapabilityReport(env);
  assert.equal(report.DOCUMENT_GENERATION.ok, true);
  assert.equal(report.ANALYSIS.ok, true);
  assert.equal(report.DISCOVERY.ok, true);
  assert.equal(report.TRACKING.ok, true);
  assert.equal(report.EXTERNAL_INTERACTION.ok, false);
  assert.equal(report.APPLICATION_SUBMISSION.ok, false);
  assert.equal(report.EXTERNAL_INTERACTION.blockingCategory, 'employer-browser');
});

console.log(`\nCapability readiness: ${passed} checks passed.`);
