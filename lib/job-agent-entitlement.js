const ACCESS_ENTITLEMENTS = new Set(['job-agent-controlled-beta', 'job-agent']);
const LEGACY_TIERS = new Set(['essential', 'complete']);
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;

function values(value) {
  return [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeJobAgentEntitlements(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(value => String(value || '').trim()).filter(value => ACCESS_ENTITLEMENTS.has(value)))].sort();
}

export function jobAgentEntitlementConfiguration(env = process.env) {
  const policyVersion = String(env.JOB_AGENT_ACCESS_POLICY_VERSION || '').trim();
  const includedLegacyTiers = values(env.JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS);
  const validTiers = includedLegacyTiers.length > 0 && includedLegacyTiers.every(tier => LEGACY_TIERS.has(tier));
  const ready = VERSION.test(policyVersion) && validTiers;
  return {
    ready,
    mode: ready ? 'controlled-beta-explicit-grant' : 'not-configured',
    policyVersion: ready ? policyVersion : null,
    includedLegacyTiers: ready ? includedLegacyTiers : [],
    dedicatedBillingEnabled: false,
    createsCharges: false,
  };
}

export function jobAgentEntitlementsForSubscription({ client, tier, env = process.env } = {}) {
  if (String(client || '') !== 'job-agent') return [];
  const configuration = jobAgentEntitlementConfiguration(env);
  if (!configuration.ready || !configuration.includedLegacyTiers.includes(String(tier || ''))) return [];
  return ['job-agent-controlled-beta'];
}

function isAdministrator(subject, env) {
  return isAdministratorSubject(subject, env);
}

export function jobAgentAccessAllowed(auth, { env = process.env } = {}) {
  if (auth?.localDevelopment === true || isAdministrator(auth?.subject, env)) return true;
  return normalizeJobAgentEntitlements(auth?.entitlements).some(value => ACCESS_ENTITLEMENTS.has(value));
}
import { isAdministratorSubject } from './admin-subject.js';
