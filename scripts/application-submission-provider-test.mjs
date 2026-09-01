import assert from 'node:assert/strict';
import { applicationSubmissionProviderConfiguration, executeApplicationSubmissionProvider, publicApplicationSubmissionProviderConfiguration } from '../lib/application-submission-provider.js';

const now = new Date('2026-08-30T22:00:00.000Z');
const env = {
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid', EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'remote-provider-test-key-at-least-32-characters',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'costs-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-beta-1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'receipt-beta-1',
  JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts', JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test',
  JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page', JOB_AGENT_RECEIPT_SECRET: 'receipt-test-secret'.padEnd(48, 'x'),
  JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED: 'true', JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED: 'true',
  JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION: 'submission-beta-1',
};

assert.equal(applicationSubmissionProviderConfiguration({}).reason, 'final-submission-execution-disabled');
assert.equal(applicationSubmissionProviderConfiguration({ ...env, JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED: 'false' }).reason, 'final-submission-execution-not-approved');
assert.equal(applicationSubmissionProviderConfiguration({ ...env, EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'false' }).reason, 'final-submission-browser-provider-not-ready');
assert.equal(applicationSubmissionProviderConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'false' }).reason, 'authoritative-receipt-capture-not-ready');
const configuration = applicationSubmissionProviderConfiguration(env);
assert.equal(configuration.ready, true);
const publicConfiguration = publicApplicationSubmissionProviderConfiguration(configuration);
assert.equal(publicConfiguration.ready, true);
assert.equal(JSON.stringify(publicConfiguration).includes(env.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY), false);
assert.equal(Object.hasOwn(publicConfiguration, 'browser'), false);

const pageUrl = 'https://careers.company.invalid/apply/REQ-2';
const scopeHash = 'a'.repeat(64);
const fieldSchemaHash = 'b'.repeat(64);
const session = {
  id: 'application_submission_provider_fixture', stage: 'submission_execution', state: 'Preparing', documentVersion: 'resume-v2',
  role: { employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-2', directEmployerUrl: pageUrl },
  proposedFields: [{ fieldKey: 'email', label: 'Email', maskedPreview: '•••@example.test' }],
  formCheckpoint: { status: 'preserved', pageUrl, fieldSchemaHash, attachedDocumentVersion: 'resume-v2' },
  approvals: { submission: { id: 'approval_submission_001', scopeHash, documentVersion: 'resume-v2', confirmedAt: '2026-08-30T21:58:00.000Z', consumedAt: '2026-08-30T21:59:00.000Z' } },
  submissionExecution: { id: 'submit_task_provider_001', status: 'executing', scopeHash, documentVersion: 'resume-v2', fieldSchemaHash, startedAt: '2026-08-30T21:59:00.000Z' },
  submissionAttempt: null, actions: [], receipt: null,
};
const browserSession = {
  provider: 'remote-stream', providerSessionReference: 'remote_session_reference_001', viewMode: 'interactive-stream', interactive: true,
  employerHostname: 'careers.company.invalid', pageUrl, fieldSchemaHash, status: 'ready', expiresAt: '2026-08-30T22:20:00.000Z',
};

let calls = 0;
let capturedRequest = null;
const success = await executeApplicationSubmissionProvider({
  session, browserSession, env, now,
  fetchImpl: async (url, options) => {
    calls += 1; capturedRequest = { url, options };
    return new Response(JSON.stringify({ status: 'attempt-recorded', submissionAttempted: true, submittedAt: '2026-08-30T22:00:01.000Z', responseFingerprint: 'c'.repeat(64), pageUrl }), { status: 200 });
  },
});
assert.equal(calls, 1);
assert.equal(success.status, 'attempt-recorded');
assert.equal(success.submitted, true);
assert.equal(success.containsReceiptEvidence, false);
assert.equal(capturedRequest.url, 'https://api.browser.invalid/v1/sessions/remote_session_reference_001/submissions');
assert.equal(capturedRequest.options.headers['X-1stStep-Contract-Version'], 'application-submission-v1');
const requestBody = JSON.parse(capturedRequest.options.body);
assert.equal(requestBody.constraints.singleAttempt, true);
assert.equal(requestBody.constraints.candidateValuesReturned, false);
assert.equal(requestBody.scopeHash, scopeHash);
assert.equal(requestBody.fieldSchemaHash, fieldSchemaHash);
assert.equal(JSON.stringify(requestBody).includes('•••@example.test'), false);
assert.equal(JSON.stringify(requestBody).includes('email'), false);

calls = 0;
const leaked = await executeApplicationSubmissionProvider({
  session, browserSession, env, now,
  fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ status: 'attempt-recorded', submissionAttempted: true, submittedAt: '2026-08-30T22:00:01.000Z', responseFingerprint: 'c'.repeat(64), pageUrl, candidateValue: 'private' }), { status: 200 }); },
});
assert.equal(calls, 1);
assert.equal(leaked.status, 'outcome-unknown');
assert.equal(leaked.submitted, 'unknown');
assert.equal(leaked.retryable, false);
assert.equal(JSON.stringify(leaked).includes('private'), false);

calls = 0;
const timeout = await executeApplicationSubmissionProvider({ session, browserSession, env, now, fetchImpl: async () => { calls += 1; throw new Error('ambiguous timeout'); } });
assert.equal(calls, 1);
assert.equal(timeout.status, 'outcome-unknown');
assert.equal(timeout.retryable, false);

calls = 0;
const disabled = await executeApplicationSubmissionProvider({ session, browserSession, env: { ...env, JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED: 'false' }, now, fetchImpl: async () => { calls += 1; throw new Error('must not call'); } });
assert.equal(calls, 0);
assert.equal(disabled.status, 'not-configured');
assert.equal(disabled.externalApplicationExecution, false);

calls = 0;
await assert.rejects(() => executeApplicationSubmissionProvider({ session, browserSession: { ...browserSession, expiresAt: '2026-08-30T21:59:59.000Z' }, env, now, fetchImpl: async () => { calls += 1; } }), /SUBMISSION_BROWSER_SESSION_EXPIRED/);
assert.equal(calls, 0);
await assert.rejects(() => executeApplicationSubmissionProvider({ session: { ...session, approvals: { submission: { ...session.approvals.submission, consumedAt: null } } }, browserSession, env, now }), /SUBMISSION_EXECUTION_NOT_AUTHORIZED/);

console.log('Disabled-by-default exact-scope final-submission provider boundary tests passed.');
