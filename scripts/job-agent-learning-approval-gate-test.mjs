import assert from 'node:assert/strict';
import { mock } from 'node:test';

mock.module('../lib/api-security.js', { namedExports: {
  applyApiHeaders: () => {}, authenticateApiRequest: async () => ({ ok: true, subject: 'tenant' }),
  hasJsonContentType: () => true, isOriginAllowed: () => true, jobAgentAccessAllowed: () => true,
} });
mock.module('../lib/durable-rate-limit.js', { namedExports: {
  enforceDurableRateLimit: async () => ({ ok: true }), sendRateLimitResult: () => assert.fail('unexpected rate limit'),
} });
mock.module('../lib/job-agent-policy-levels.js', { namedExports: {
  JOB_AGENT_POLICY_LEVELS: { DATA_CONSENT: 'DATA_CONSENT' }, requireJobAgentPolicyLevel: async () => ({ ok: true }),
} });
mock.module('../lib/job-agent-runtime-configuration.js', { namedExports: { jobAgentRuntimeConfiguration: () => ({}) } });
mock.module('../lib/job-agent-learning-domain.js', { namedExports: {
  correctPreference: () => {}, createJobAgentLearningState: () => ({}),
  promoteLearningProposal: () => assert.fail('legacy evaluation must not promote'), publicLearningSummary: () => ({}),
  recordPreference: () => {}, revokePreference: () => {}, rollbackLearningPolicy: () => {}, setLearningStatus: () => {},
} });
mock.module('../lib/job-agent-learning-store.js', { namedExports: {
  deleteJobAgentLearningState: async () => {},
  readJobAgentLearningState: async () => ({ version: 1, state: { proposals: [{ id: 'legacy', status: 'evaluated' }] } }),
  saveJobAgentLearningState: async () => assert.fail('blocked approval must not write'),
} });
mock.module('../lib/applicant-vault-store.js', { namedExports: { readApplicantVault: async () => ({ vault: null }) } });
mock.module('../lib/applicant-vault-domain.js', { namedExports: { publicVaultSummary: () => ({ facts: [] }) } });

const { default: handler } = await import('../api/job-agent-learning.js');
const response = {
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
};
await handler({ method: 'POST', headers: {}, body: { version: 1, action: 'approve-proposal', input: { id: 'legacy' } } }, response);
assert.equal(response.statusCode, 409);
assert.equal(response.body.code, 'LEARNING_EVALUATION_UNVERIFIED');
console.log('Legacy learning proposals cannot be approved without verified evaluation evidence.');
