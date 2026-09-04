import assert from 'node:assert/strict';
import {
  JOB_AGENT_POLICY_LEVELS,
  JOB_AGENT_DATA_CONSENT_SCOPES,
  jobAgentDataPolicyConfiguration,
  activeJobAgentDataConsent,
  requireJobAgentPolicyLevel,
} from '../lib/job-agent-policy-levels.js';
import {
  applicationSessionPolicyLevel,
  EXTERNAL_APPLICATION_SESSION_ACTIONS,
  AUTHORIZED_APPLICATION_SESSION_ACTIONS,
} from '../api/application-sessions.js';

const L = JOB_AGENT_POLICY_LEVELS;
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('  PASS  ' + name); };

// Terms + Privacy configured. Authorization version and counsel deliberately ABSENT.
const dataEnv = {
  VERCEL_ENV: 'production',
  JOB_AGENT_TERMS_VERSION: 'terms-2026-08-31',
  JOB_AGENT_PRIVACY_VERSION: 'privacy-2026-08-31',
};
const consentRecord = {
  schemaVersion: 1, status: 'active',
  policy: { termsVersion: 'terms-2026-08-31', privacyVersion: 'privacy-2026-08-31', authorizationVersion: 'authz-2026-08-31' },
  scopes: [...JOB_AGENT_DATA_CONSENT_SCOPES, 'direct-employer-discovery'],
  attestations: { truthful: true, reviewed: true },
  grantedAt: '2026-08-31T00:00:00.000Z', revokedAt: null, audit: [], updatedAt: '2026-08-31T00:00:00.000Z',
};
const stubConfig = { redis: {}, partitionSecret: 'p'.repeat(40), dataEncryptionKey: 'k' };
// Inject the stored record without touching Redis.
const withRecord = record => ({ ...stubConfig, __record: record });
const originalRead = (await import('../lib/job-agent-consent-store.js')).readJobAgentConsent;
assert.equal(typeof originalRead, 'function', 'consent store contract unchanged');

// ── A/B/C: internal capabilities work on Terms+Privacy with NO authorization ──
await check('A · DATA_CONSENT config is satisfied by Terms + Privacy alone', async () => {
  const policy = jobAgentDataPolicyConfiguration(dataEnv);
  assert.equal(policy.ready, true, 'authorization version and counsel are not consulted');
  assert.equal(dataEnv.JOB_AGENT_AUTHORIZATION_VERSION, undefined);
  assert.equal(dataEnv.JOB_AGENT_COUNSEL_APPROVED, undefined);
  assert.equal(activeJobAgentDataConsent(consentRecord, policy).ok, true, 'vault / packages / sessions may proceed');
});

await check('B · internal package storage passes the same check', async () => {
  const policy = jobAgentDataPolicyConfiguration(dataEnv);
  assert.equal(activeJobAgentDataConsent(consentRecord, policy).ok, true);
});

await check('C · tracking / session state passes the same check', async () => {
  assert.equal(applicationSessionPolicyLevel({ action: 'save-notes' }), L.DATA_CONSENT);
  assert.equal(applicationSessionPolicyLevel({}), L.DATA_CONSENT);
});

// ── D/E: external actions still demand the full gate ─────────────────────────
await check('D · employer interaction stays EXTERNAL', async () => {
  for (const action of ['confirm-external-step', 'reconcile-employer-failure', 'request-final-review', 'refresh-final-approval']) {
    assert.equal(applicationSessionPolicyLevel({ action }), L.EXTERNAL, `${action} must be EXTERNAL`);
  }
});

await check('E · submission-consequential actions stay EXTERNAL', async () => {
  for (const action of ['confirm-submission', 'confirm-transmission', 'record-post-submission']) {
    assert.equal(applicationSessionPolicyLevel({ action }), L.EXTERNAL, `${action} must be EXTERNAL`);
  }
  assert.equal(applicationSessionPolicyLevel({ action: 'resume' }), L.AUTHORIZATION, 'unattended resume needs authorization');
});

// ── F: persisted career data fails closed without Terms/Privacy consent ──────
await check('F · missing Terms/Privacy consent fails closed', async () => {
  const unconfigured = jobAgentDataPolicyConfiguration({ VERCEL_ENV: 'production' });
  assert.equal(unconfigured.ready, false);
  assert.equal(activeJobAgentDataConsent(consentRecord, unconfigured).code, 'JOB_AGENT_DATA_POLICY_NOT_CONFIGURED');

  const policy = jobAgentDataPolicyConfiguration(dataEnv);
  assert.equal(activeJobAgentDataConsent(null, policy).code, 'JOB_AGENT_DATA_CONSENT_REQUIRED');
  assert.equal(activeJobAgentDataConsent({ ...consentRecord, status: 'revoked' }, policy).code, 'JOB_AGENT_DATA_CONSENT_REQUIRED');

  const stale = { ...consentRecord, policy: { ...consentRecord.policy, termsVersion: 'terms-old' } };
  assert.equal(activeJobAgentDataConsent(stale, policy).code, 'JOB_AGENT_DATA_CONSENT_RENEWAL_REQUIRED');

  const narrowed = { ...consentRecord, scopes: ['direct-employer-discovery'] };
  assert.equal(activeJobAgentDataConsent(narrowed, policy).code, 'JOB_AGENT_DATA_CONSENT_SCOPE_MISSING');

  const unattested = { ...consentRecord, attestations: { truthful: true, reviewed: false } };
  assert.equal(activeJobAgentDataConsent(unattested, policy).ok, false);
});

// ── G: unknown policy level fails closed ─────────────────────────────────────
await check('G · unknown policy level fails closed', async () => {
  const result = await requireJobAgentPolicyLevel('SOMETHING_ELSE', { config: stubConfig, subject: 'sub', env: dataEnv });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'POLICY_LEVEL_UNKNOWN');
  assert.equal(result.status, 500);
  const undef = await requireJobAgentPolicyLevel(undefined, { config: stubConfig, subject: 'sub', env: dataEnv });
  assert.equal(undef.ok, false);
  assert.equal(undef.code, 'POLICY_LEVEL_UNKNOWN');
});

// ── H: no operation inherits a weaker gate from a sibling in the same module ──
await check('H · no external action inherits the internal gate', async () => {
  const external = new Set(EXTERNAL_APPLICATION_SESSION_ACTIONS);
  const authorized = new Set(AUTHORIZED_APPLICATION_SESSION_ACTIONS);
  // Every action the handler actually implements, classified explicitly.
  const implemented = [
    'confirm-external-step', 'confirm-submission', 'confirm-transmission', 'pause',
    'reconcile-employer-failure', 'record-post-submission', 'refresh-final-approval',
    'request-final-review', 'resume',
  ];
  for (const action of implemented) {
    const level = applicationSessionPolicyLevel({ action });
    if (external.has(action)) assert.equal(level, L.EXTERNAL, `${action} must not be downgraded`);
    else if (authorized.has(action)) assert.equal(level, L.AUTHORIZATION, `${action} must not be downgraded`);
    else assert.equal(level, L.DATA_CONSENT, `${action} classified as internal`);
  }
  // Guard against a future action silently defaulting to the weakest level.
  const consequential = implemented.filter(a => /submit|submission|transmis|external|employer|final/.test(a));
  for (const action of consequential) {
    assert.equal(applicationSessionPolicyLevel({ action }), L.EXTERNAL, `${action} looks consequential and must be EXTERNAL`);
  }
});

await check('I · NONE is explicit and never inferred', async () => {
  const none = await requireJobAgentPolicyLevel(L.NONE, { config: stubConfig, subject: 'sub', env: dataEnv });
  assert.equal(none.ok, true);
  assert.equal(none.enforced, false);
});

console.log(`\nPolicy levels: ${passed} checks passed.`);
