import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { jobAgentPilotAccessForSubject, jobAgentPilotAccessForTenant, jobAgentPilotConfiguration, publicJobAgentPilotAccess } from '../lib/job-agent-pilot-access.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const partitionSecret = 'pilot-partition-secret-at-least-32-characters';
const subject = 'invited-candidate@example.test';
const tenantId = jobAgentTenantId(subject, partitionSecret);
const env = {
  RATE_LIMIT_HASH_SECRET: partitionSecret, JOB_AGENT_PILOT_ENFORCEMENT: 'true', JOB_AGENT_PILOT_MAX_USERS: '3',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: `${tenantId},${'b'.repeat(40)}`,
};

assert.equal(jobAgentPilotConfiguration({}).enforced, false);
assert.equal(jobAgentPilotAccessForSubject(subject, {}).ok, true);
assert.equal(jobAgentPilotConfiguration({ ...env, JOB_AGENT_PILOT_MAX_USERS: '11' }).ready, false);
assert.equal(jobAgentPilotConfiguration({ ...env, JOB_AGENT_PILOT_ALLOWED_TENANTS: 'not-a-tenant' }).reason, 'pilot-allowlist-invalid');
assert.equal(jobAgentPilotConfiguration({ ...env, JOB_AGENT_PILOT_ALLOWED_TENANTS: `${tenantId},${tenantId}` }).invitedTenantCount, 1);
assert.equal(jobAgentPilotAccessForSubject(subject, env).ok, true);
assert.equal(jobAgentPilotAccessForTenant(tenantId, env).ok, true);
const denied = jobAgentPilotAccessForSubject('not-invited@example.test', env);
assert.equal(denied.ok, false);
assert.equal(denied.status, 403);
assert.equal(denied.code, 'JOB_AGENT_PILOT_INVITE_REQUIRED');
const unavailable = jobAgentPilotAccessForSubject(subject, { ...env, RATE_LIMIT_HASH_SECRET: '' });
assert.equal(unavailable.code, 'JOB_AGENT_PILOT_NOT_CONFIGURED');
const publicDenied = publicJobAgentPilotAccess(denied);
assert.deepEqual(publicDenied, { enforced: true, allowed: false, code: 'JOB_AGENT_PILOT_INVITE_REQUIRED', maxUsers: 3, invitedTenantCount: 2 });
assert.equal(JSON.stringify(publicDenied).includes(tenantId), false);
assert.equal(JSON.stringify(publicDenied).includes(subject), false);

const utility = spawnSync(process.execPath, ['scripts/job-agent-pilot-tenant-id.mjs'], {
  cwd: new URL('..', import.meta.url), input: `${subject}\n`, encoding: 'utf8', env: { ...process.env, RATE_LIMIT_HASH_SECRET: partitionSecret },
});
assert.equal(utility.status, 0, utility.stderr);
const utilityOutput = JSON.parse(utility.stdout);
assert.equal(utilityOutput.tenantId, tenantId);
assert.equal(utilityOutput.containsRawSubject, false);
assert.equal(utility.stdout.includes(subject), false);

console.log('Fail-closed pseudonymous pilot allowlist, 1-10 seat bound, invite denial, public redaction, and no-retention tenant-ID utility tests passed.');
