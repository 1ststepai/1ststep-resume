import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeEmployerBrowserHandoff, createEmployerBrowserHandoff, employerBrowserSessionProviderConfiguration, resumeEmployerBrowserHandoff } from '../lib/employer-browser-session-provider.js';

const now = new Date('2026-08-30T21:00:00.000Z');
const env = {
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid', EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'remote-provider-test-key-at-least-32-characters',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'costs-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
};
const application = {
  id: 'application_remote_provider_fixture', updatedAt: '2026-08-30T20:55:00.000Z',
  role: { employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-2', directEmployerUrl: 'https://careers.company.invalid/apply/REQ-2' },
  proposedFields: [{ fieldKey: 'firstName', label: 'First name', maskedPreview: 'J••••' }],
};
const fields = [
  { fieldRef: 'field_first_name', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true },
  { fieldRef: 'field_email_address', fieldKey: 'email', label: 'Email address', inputType: 'email', required: true },
];
const fieldSchemaHash = createHash('sha256').update(JSON.stringify(fields.map(({ fieldRef, fieldKey, inputType, required }) => ({ fieldRef, fieldKey, inputType, required })))).digest('hex');
const providerPayload = {
  status: 'ready', providerSessionReference: 'remote_session_reference_001',
  streamUrl: 'https://stream.browser.invalid/session/001?ticket=short-lived', pageUrl: application.role.directEmployerUrl,
  fieldSchemaHash, fields, expiresAt: new Date(now.getTime() + 20 * 60_000).toISOString(),
  policyAttestation: {
    networkAllowlist: ['careers.company.invalid'], submissionsBlocked: true, credentialCapture: 'provider-only',
    recording: false, candidateValuesReturned: false, downloadsBlocked: true,
  },
};
const calls = [];
const providerFetch = async (url, options) => {
  calls.push({ url, options });
  if (options.method === 'DELETE') return new Response(JSON.stringify({ status: 'closed' }), { status: 200 });
  return new Response(JSON.stringify(providerPayload), { status: 200 });
};

const configuration = employerBrowserSessionProviderConfiguration(env);
assert.equal(configuration.enabled, true);
assert.equal(configuration.interactive, true);
assert.equal(configuration.viewMode, 'interactive-stream');
assert.equal(employerBrowserSessionProviderConfiguration({ ...env, EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'false' }).reason, 'remote-stream-costs-not-approved');
assert.equal(employerBrowserSessionProviderConfiguration({ ...env, EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'false' }).reason, 'remote-stream-csp-not-approved');
assert.equal(employerBrowserSessionProviderConfiguration({ ...env, EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://other.invalid' }).reason, 'remote-stream-csp-not-approved');
assert.equal(employerBrowserSessionProviderConfiguration({ ...env, VERCEL_ENV: 'production' }).reason, 'remote-stream-configuration-invalid');

const created = await createEmployerBrowserHandoff({ session: application, env, now, fetchImpl: providerFetch });
assert.equal(created.status, 'ready');
assert.equal(created.interactive, true);
assert.equal(created.submitted, false);
assert.equal(created.containsCandidateFieldValues, false);
assert.equal(created.fieldSchemaHash, fieldSchemaHash);
assert.equal(created.streamUrl, providerPayload.streamUrl);
assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY}`);
const createBody = JSON.parse(calls[0].options.body);
assert.deepEqual(createBody.policy.networkAllowlist, ['careers.company.invalid']);
assert.equal(createBody.policy.submissionsBlocked, true);
assert.equal(JSON.stringify(createBody).includes('J••••'), false);
assert.equal(JSON.stringify(createBody).includes('firstName'), false);

const browserSession = {
  provider: 'remote-stream', providerSessionReference: created.providerSessionReference, employerHostname: created.employerHostname,
  pageUrl: created.pageUrl, fieldSchemaHash: created.fieldSchemaHash, status: 'ready', expiresAt: created.expiresAt,
};
const restored = await resumeEmployerBrowserHandoff({ session: application, browserSession, env, now, fetchImpl: providerFetch });
assert.equal(restored.status, 'ready');
assert.equal(restored.fieldSchemaHash, created.fieldSchemaHash);
assert.deepEqual(await closeEmployerBrowserHandoff({ browserSession, env, fetchImpl: providerFetch }), { status: 'closed', externalAction: true });
assert.deepEqual(await closeEmployerBrowserHandoff({ browserSession, env: { ...env, EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'false' }, fetchImpl: providerFetch }), { status: 'closed', externalAction: true });
assert.deepEqual(await closeEmployerBrowserHandoff({ browserSession, env: { ...env, EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: '' }, fetchImpl: providerFetch }), { status: 'closed', externalAction: true });

let recoveryCalls = 0;
const recoveryFetch = async (_url, options) => {
  recoveryCalls += 1;
  if (options.method === 'POST') throw new Error('simulated ambiguous provider timeout');
  return new Response(JSON.stringify(providerPayload), { status: 200 });
};
const recovered = await createEmployerBrowserHandoff({ session: application, env, now, fetchImpl: recoveryFetch });
assert.equal(recovered.status, 'ready');
assert.equal(recoveryCalls, 2);

await assert.rejects(createEmployerBrowserHandoff({
  session: application, env, now,
  fetchImpl: async () => new Response(JSON.stringify({ ...providerPayload, policyAttestation: { ...providerPayload.policyAttestation, submissionsBlocked: false } }), { status: 200 }),
}), /REMOTE_STREAM_POLICY_ATTESTATION_INVALID/);
await assert.rejects(createEmployerBrowserHandoff({
  session: application, env, now,
  fetchImpl: async () => new Response(JSON.stringify({ ...providerPayload, streamUrl: 'https://attacker.invalid/session/001' }), { status: 200 }),
}), /REMOTE_STREAM_VIEW_ORIGIN_MISMATCH/);
await assert.rejects(createEmployerBrowserHandoff({
  session: application, env, now,
  fetchImpl: async () => new Response(JSON.stringify({ ...providerPayload, fields: [{ ...fields[0], value: 'candidate data' }] }), { status: 200 }),
}), /REMOTE_STREAM_FIELD_SCHEMA_INVALID/);

console.log('Remote browser provider explicit activation, cost/CSP gates, exact-host policy attestation, value-free schema, idempotent timeout recovery, restore, and confirmed teardown tests passed.');
