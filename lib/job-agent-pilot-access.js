import { jobAgentTenantId } from './job-agent-run-store.js';

const TENANT_ID = /^[a-f0-9]{40}$/;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function jobAgentPilotConfiguration(env = process.env) {
  const enforced = enabled(env.JOB_AGENT_PILOT_ENFORCEMENT);
  if (!enforced) return { enforced: false, ready: false, maxUsers: null, invitedTenantCount: 0, reason: 'pilot-enforcement-disabled' };
  const maxUsers = Number(env.JOB_AGENT_PILOT_MAX_USERS);
  const tenantIds = [...new Set(String(env.JOB_AGENT_PILOT_ALLOWED_TENANTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
  if (!Number.isSafeInteger(maxUsers) || maxUsers < 1 || maxUsers > 10) return { enforced: true, ready: false, maxUsers: null, invitedTenantCount: 0, reason: 'pilot-limit-invalid' };
  if (!tenantIds.length || tenantIds.length > maxUsers || tenantIds.some(value => !TENANT_ID.test(value))) {
    return { enforced: true, ready: false, maxUsers, invitedTenantCount: 0, reason: 'pilot-allowlist-invalid' };
  }
  return { enforced: true, ready: true, maxUsers, invitedTenantCount: tenantIds.length, tenantIds };
}

export function jobAgentPilotAccessForTenant(tenantId, env = process.env) {
  const configuration = jobAgentPilotConfiguration(env);
  if (!configuration.enforced) return { ok: true, enforced: false, code: null, maxUsers: null, invitedTenantCount: 0 };
  if (!configuration.ready) return { ok: false, enforced: true, status: 503, code: 'JOB_AGENT_PILOT_NOT_CONFIGURED', maxUsers: configuration.maxUsers, invitedTenantCount: configuration.invitedTenantCount };
  const allowed = configuration.tenantIds.includes(String(tenantId || '').toLowerCase());
  return {
    ok: allowed, enforced: true, status: allowed ? 200 : 403,
    code: allowed ? null : 'JOB_AGENT_PILOT_INVITE_REQUIRED',
    maxUsers: configuration.maxUsers, invitedTenantCount: configuration.invitedTenantCount,
  };
}

export function jobAgentPilotAccessForSubject(subject, env = process.env) {
  const configuration = jobAgentPilotConfiguration(env);
  if (!configuration.enforced) return { ok: true, enforced: false, code: null, maxUsers: null, invitedTenantCount: 0 };
  const partitionSecret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  if (partitionSecret.length < 32) return { ok: false, enforced: true, status: 503, code: 'JOB_AGENT_PILOT_NOT_CONFIGURED', maxUsers: configuration.maxUsers, invitedTenantCount: configuration.invitedTenantCount };
  return jobAgentPilotAccessForTenant(jobAgentTenantId(subject, partitionSecret), env);
}

export function publicJobAgentPilotAccess(result = {}) {
  return {
    enforced: result.enforced === true,
    allowed: result.ok === true,
    code: result.code || null,
    maxUsers: Number.isSafeInteger(result.maxUsers) ? result.maxUsers : null,
    invitedTenantCount: Math.max(0, Number(result.invitedTenantCount) || 0),
  };
}
