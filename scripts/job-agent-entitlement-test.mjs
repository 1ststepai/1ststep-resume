import assert from 'node:assert/strict';
import {
  jobAgentAccessAllowed, jobAgentEntitlementConfiguration, jobAgentEntitlementsForSubscription,
  normalizeJobAgentEntitlements,
} from '../lib/job-agent-entitlement.js';
import { isAdministratorSubject, isProductOwnerSubject } from '../lib/admin-subject.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const env = {
  JOB_AGENT_ACCESS_POLICY_VERSION: 'controlled-beta-2026-08',
  JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete,essential',
  OWNER_ACCESS_EMAILS: 'owner@example.test',
};

assert.equal(jobAgentEntitlementConfiguration({}).ready, false);
assert.equal(jobAgentEntitlementConfiguration({ ...env, JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'free' }).ready, false);
assert.deepEqual(jobAgentEntitlementConfiguration(env), {
  ready: true,
  mode: 'controlled-beta-explicit-grant',
  policyVersion: 'controlled-beta-2026-08',
  includedLegacyTiers: ['complete', 'essential'],
  dedicatedBillingEnabled: false,
  createsCharges: false,
});
assert.deepEqual(jobAgentEntitlementsForSubscription({ client: 'legacy-app', tier: 'complete', env }), []);
assert.deepEqual(jobAgentEntitlementsForSubscription({ client: 'job-agent', tier: 'free', env }), []);
assert.deepEqual(jobAgentEntitlementsForSubscription({ client: 'job-agent', tier: 'complete', env: {} }), []);
assert.deepEqual(jobAgentEntitlementsForSubscription({ client: 'job-agent', tier: 'complete', env }), ['job-agent-controlled-beta']);
assert.deepEqual(normalizeJobAgentEntitlements(['job-agent', 'unknown', 'job-agent']), ['job-agent']);

assert.equal(jobAgentAccessAllowed({ subject: 'member@example.test', tier: 'complete', entitlements: [] }, { env }), false, 'A legacy paid tier must not imply Job Agent access.');
assert.equal(jobAgentAccessAllowed({ subject: 'member@example.test', tier: 'free', entitlements: ['job-agent-controlled-beta'] }, { env }), true, 'The explicit grant controls access independently of legacy tier.');
assert.equal(jobAgentAccessAllowed({ subject: 'owner@example.test', tier: 'free', entitlements: [] }, { env }), true);
assert.equal(jobAgentAccessAllowed({ subject: 'EVAN@1STSTEP.AI', tier: 'free', entitlements: [] }, { env: {} }), true, 'The verified product owner always receives administrator Job Agent access.');
assert.equal(jobAgentAccessAllowed({ localDevelopment: true, subject: 'dev:127.0.0.1', tier: 'free' }, { env: {} }), true);

const partitionSecret = 'pilot-partition-secret-at-least-32-characters';
const invited = 'invited-candidate@example.test';
const invitedEnv = {
  ...env,
  RATE_LIMIT_HASH_SECRET: partitionSecret,
  JOB_AGENT_PILOT_ENFORCEMENT: 'true',
  JOB_AGENT_PILOT_MAX_USERS: '3',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: `${jobAgentTenantId(invited, partitionSecret)},${'c'.repeat(40)}`,
};
assert.equal(jobAgentAccessAllowed({ subject: invited, tier: 'free', entitlements: [] }, { env: invitedEnv }), true, 'An invited controlled-beta tenant can use Job Agent without becoming an administrator.');
assert.equal(jobAgentAccessAllowed({ subject: 'not-invited@example.test', tier: 'free', entitlements: [] }, { env: invitedEnv }), false, 'Uninvited accounts do not receive Job Agent access from the allowlist.');
assert.equal(isAdministratorSubject('epancis12@gmail.com', { OWNER_ACCESS_EMAILS: 'evan@1ststep.ai' }), false);
assert.equal(isAdministratorSubject('evan@1ststep.ai', { OWNER_ACCESS_EMAILS: 'evan@1ststep.ai' }), true);
assert.equal(isProductOwnerSubject('epancis12@gmail.com'), false);
assert.equal(isProductOwnerSubject('evan@1ststep.ai'), true);
assert.equal(isProductOwnerSubject('EVAN@1STSTEP.AI'), true);

console.log('Explicit no-charge Job Agent entitlement policy, legacy-tier separation, owner control, and fail-closed configuration tests passed.');
