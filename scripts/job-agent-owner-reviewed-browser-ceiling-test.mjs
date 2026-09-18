import assert from 'node:assert/strict';
import { mock } from 'node:test';

const ownerReviewedRemoteEnv = {
  JOB_AGENT_OWNER_REVIEWED_POLICY: 'true',
  VERCEL_ENV: 'preview',
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream',
  EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid',
  EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'remote-provider-test-key-at-least-32-characters',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'costs-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
};

let storedBrowserSession = null;
let createSessionCalls = 0;

mock.module('../lib/api-security.js', {
  namedExports: {
    applyApiHeaders() {},
    authenticateApiRequest: async () => ({ ok: true, subject: 'invited-beta@example.test', tier: 'complete' }),
    hasJsonContentType: () => true,
    isOriginAllowed: () => true,
    jobAgentAccessAllowed: () => true,
  },
});
mock.module('../lib/job-agent-runtime-configuration.js', {
  namedExports: {
    jobAgentRuntimeConfiguration: () => ({ redis: {}, partitionSecret: 'owner-reviewed-partition-secret-32chars', dataEncryptionKey: 'unused', auditSigningSecret: 'a'.repeat(48) }),
  },
});
mock.module('../lib/durable-rate-limit.js', {
  namedExports: {
    enforceDurableRateLimit: async () => ({ ok: true }),
    sendRateLimitResult() {},
  },
});
mock.module('../lib/job-agent-consent-store.js', {
  namedExports: {
    jobAgentConsentGate: async () => ({ ok: true }),
  },
});
mock.module('../lib/application-session-store.js', {
  namedExports: {
    readDurableApplicationSession: async () => ({
      id: 'application_session_ceiling_001',
      updatedAt: '2026-09-17T20:55:00.000Z',
      role: { employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-2', directEmployerUrl: 'https://careers.company.invalid/apply/REQ-2' },
      proposedFields: [{ fieldKey: 'firstName', label: 'First name', maskedPreview: 'J••••' }],
    }),
  },
});
mock.module('../lib/employer-browser-session-store.js', {
  namedExports: {
    readEmployerBrowserSessionForApplication: async () => storedBrowserSession,
    createEmployerBrowserSession: async () => {
      createSessionCalls += 1;
      throw new Error('owner-reviewed cloud-browser session must not be persisted');
    },
  },
});
mock.module('../lib/employer-browser-session-lifecycle.js', {
  namedExports: {
    BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED: 'BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED',
    closeEmployerBrowserSessionBeforeDelete: async () => ({ status: 'closed' }),
  },
});

const previousEnv = { ...process.env };
Object.assign(process.env, ownerReviewedRemoteEnv);

const { default: handler } = await import('../api/employer-browser-session.js');
const { employerBrowserSessionProviderConfiguration } = await import('../lib/employer-browser-session-provider.js');

function response() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

try {
  const configuration = employerBrowserSessionProviderConfiguration(process.env);
  assert.equal(configuration.enabled, false);
  assert.equal(configuration.reason, 'OWNER_REVIEWED_CAPABILITY_CEILING');

  storedBrowserSession = null;
  const postCreate = response();
  await handler({
    method: 'POST',
    headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' },
    body: { applicationSessionId: 'application_session_ceiling_001' },
    query: {},
    socket: {},
  }, postCreate);
  assert.equal(postCreate.statusCode, 503);
  assert.equal(postCreate.body?.code, 'BROWSER_HANDOFF_NOT_CONFIGURED');
  assert.equal(postCreate.body?.provider?.available, false);
  assert.equal(postCreate.body?.provider?.interactive, false);
  assert.equal(postCreate.body?.provider?.reason, 'OWNER_REVIEWED_CAPABILITY_CEILING');
  assert.equal(postCreate.body?.view?.status === 'ready', false);
  assert.equal(postCreate.body?.view?.streamUrl, undefined);
  assert.equal(createSessionCalls, 0);

  storedBrowserSession = {
    id: 'browser_session_ceiling_001',
    status: 'ready',
    provider: 'remote-stream',
    providerSessionReference: 'remote_session_reference_001',
    employerHostname: 'careers.company.invalid',
    pageUrl: 'https://careers.company.invalid/apply/REQ-2',
    fieldSchemaHash: 'a'.repeat(64),
    expiresAt: '2026-09-17T21:30:00.000Z',
  };

  const postResume = response();
  await handler({
    method: 'POST',
    headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' },
    body: { applicationSessionId: 'application_session_ceiling_001' },
    query: {},
    socket: {},
  }, postResume);
  assert.equal(postResume.statusCode, 503);
  assert.equal(postResume.body?.code, 'BROWSER_HANDOFF_NOT_CONFIGURED');
  assert.equal(postResume.body?.provider?.available, false);
  assert.equal(postResume.body?.view?.status === 'ready', false);
  assert.equal(postResume.body?.view?.streamUrl, undefined);
  assert.equal(JSON.stringify(postResume.body || {}).includes('remote_session_reference_001'), false);
  assert.equal(createSessionCalls, 0);

  const getExisting = response();
  await handler({
    method: 'GET',
    headers: { origin: 'https://app.1ststep.ai' },
    body: {},
    query: { applicationSessionId: 'application_session_ceiling_001' },
    socket: {},
  }, getExisting);
  assert.equal(getExisting.statusCode, 503);
  assert.equal(getExisting.body?.view?.status, 'not-configured');
  assert.equal(getExisting.body?.view?.reason, 'OWNER_REVIEWED_CAPABILITY_CEILING');
  assert.equal(getExisting.body?.provider?.available, false);
  assert.equal(getExisting.body?.provider?.interactive, false);
  assert.equal(getExisting.body?.view?.streamUrl, undefined);
  assert.equal(JSON.stringify(getExisting.body || {}).includes('remote_session_reference_001'), false);
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in previousEnv)) delete process.env[key];
  }
  Object.assign(process.env, previousEnv);
  mock.restoreAll();
}

console.log('Owner-reviewed cloud-browser API ceiling tests passed.');
