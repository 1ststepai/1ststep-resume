import assert from 'node:assert/strict';
import readinessHandler, { authorizeJobAgentReadinessRequest } from '../api/job-agent-readiness.js';

Object.assign(process.env, {
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
  UPSTASH_REDIS_REST_URL: 'https://synthetic-redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
  TIER_SECRET: 't'.repeat(48),
  RATE_LIMIT_HASH_SECRET: 'r'.repeat(48),
  JOB_AGENT_AUDIT_SECRET: 'a'.repeat(48),
  JOB_AGENT_AUDIT_EXPORT_SECRET: 'e'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_ENABLED: 'true',
  JOB_AGENT_AUDIT_ARCHIVE_APPROVED: 'true',
  JOB_AGENT_AUDIT_ARCHIVE_APPROVAL_VERSION: 'archive-approval-test',
  JOB_AGENT_AUDIT_ARCHIVE_CONTRACT_VERSION: 'archive-contract-test',
  JOB_AGENT_AUDIT_ARCHIVE_LEGAL_HOLD_POLICY_VERSION: 'legal-hold-test',
  JOB_AGENT_AUDIT_ARCHIVE_URL: 'https://audit-archive.example.test/v1/heads',
  JOB_AGENT_AUDIT_ARCHIVE_ALLOWED_HOSTS: 'audit-archive.example.test',
  JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN: 'u'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET: 'k'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS: '365',
  BETA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  BETA_DATA_ENCRYPTION_KEY_ID: 'beta-test',
  JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true',
  BLOB_READ_WRITE_TOKEN: 'b'.repeat(32),
  JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true',
  JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.example.test/scan',
  JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.example.test',
  JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: 'm'.repeat(48),
  JOB_AGENT_COUNSEL_APPROVED: 'true',
  JOB_AGENT_CONSENT_ENFORCEMENT: 'true',
  JOB_AGENT_TERMS_VERSION: 'terms-test',
  JOB_AGENT_PRIVACY_VERSION: 'privacy-test',
  JOB_AGENT_AUTHORIZATION_VERSION: 'authorization-test',
  JOB_AGENT_SCHEDULE_ENABLED: 'true',
  JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '5',
  JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true',
  RESEND_API_KEY: 'resend'.padEnd(32, 'x'),
  RESEND_FROM: 'alerts@example.test',
  RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
  JOB_AGENT_RECEIPT_SECRET: 'q'.repeat(48),
  AI_GLOBAL_DAILY_UNITS: '100',
  CLAUDE_GLOBAL_DAILY_UNITS: '100',
  JOB_SEARCH_GLOBAL_DAILY_CALLS: '100',
  DISCOVERY_GLOBAL_DAILY_CALLS: '100',
  PACKAGE_GLOBAL_DAILY_UNITS: '20',
  JOB_AGENT_CONTROLLED_BETA_APPROVED: 'false',
  CRON_SECRET: 'readiness-cron-secret'.padEnd(48, 'x'),
});

let fetchCalled = false;
globalThis.fetch = async () => { fetchCalled = true; throw new Error('Network must not be reached by the static launch gate test.'); };

const forgedSameOrigin = await authorizeJobAgentReadinessRequest({
  headers: { origin: 'https://app.1ststep.ai' }, socket: {},
}, { env: process.env });
assert.equal(forgedSameOrigin.ok, false);
assert.equal(forgedSameOrigin.status, 401);
assert.equal(forgedSameOrigin.code, 'AUTH_REQUIRED');

const response = {
  statusCode: 200,
  body: undefined,
  headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  end() { return this; },
};

await readinessHandler({ method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: {}, socket: {} }, response);
assert.equal(response.statusCode, 503);
assert.equal(response.body.failedStage, 'controlled-beta-launch-manifest');
assert.equal(response.body.launchMode, 'preview');
assert.equal(response.body.requiredLaunchMode, 'signed-beta');
assert.equal(response.body.assistedExecutionMode, 'greenhouse-extension');
assert.equal(response.body.extensionHandoff.ready, false);
assert.equal(response.body.extensionHandoff.valuesPersistedByExtension, false);
assert.equal(response.body.extensionHandoff.submissionsEnabled, false);
assert.equal(response.body.supportAndIncidentOwnership.ready, false);
assert.equal(response.body.supportAndIncidentOwnership.containsOwnerIdentifiers, false);
assert.equal(response.body.externalApplicationExecution, false);
assert.equal(response.body.submissionsEnabled, false);
assert.ok(response.body.launchBlockers.includes('CONTROLLED_BETA_NOT_APPROVED'));
assert.equal(response.body.launchActionPlan.contentFree, true);
assert.equal(response.body.launchActionPlan.containsCandidateValues, false);
assert.equal(response.body.launchActionPlan.nextStage, 'signed-beta');
assert.ok(response.body.launchActionPlan.topActions.length <= 5);
assert.equal(response.body.launchActionPlan.truncated, true);
assert.equal(fetchCalled, false);

response.statusCode = 200;
response.body = undefined;
await readinessHandler({ method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: { deep: '1' }, socket: {} }, response);
assert.equal(response.statusCode, 403);
assert.equal(response.body.code, 'DRILL_CONFIRMATION_REQUIRED');
assert.equal(response.body.externalApplicationExecution, false);
assert.equal(response.body.submissionsEnabled, false);
assert.equal(fetchCalled, false);

console.log('Controlled-beta readiness API fail-closed test passed.');
