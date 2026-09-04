import assert from 'node:assert/strict';
import { beginReservedApplicationSubmission, beginReservedApplicationTransmission, completeReservedApplicationTransmission, confirmApplicationApproval, createApplicationSession, preserveApplicationFormCheckpoint, requestApplicationSubmissionApproval, reserveApplicationSubmissionExecution, reserveApplicationTransmission } from '../lib/application-session-domain.js';
import { applicationSubmissionTaskWorkerConfiguration, processNextApplicationSubmissionTask, reconcileNextStaleApplicationSubmissionTask } from '../lib/application-submission-task-worker.js';
import { buildJobAgentLaunchEvidence } from '../lib/job-agent-launch-evidence.js';

const taskId = 'submission_task_worker_fixture';
const schemaHash = 'd'.repeat(64);
const env = {
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid',
  EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/', EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'remote-provider-test-key-at-least-32-characters',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'costs-beta-1', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-beta-1', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'receipt-beta-1',
  JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts', JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test', JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page', JOB_AGENT_RECEIPT_SECRET: 'receipt-secret'.padEnd(48, 'x'),
  JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION: 'receipt-worker-beta-1',
  JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED: 'true', JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED: 'true', JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION: 'submission-beta-1',
  JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED: 'true', JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVED: 'true', JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION: 'durable-beta-1',
  EMPLOYER_TERMS_REVIEW_VERSION: 'terms-review-beta-1', JOB_AGENT_ASSISTED_APPLICATION_APPROVED: 'true', JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION: 'assisted-beta-1',
  JOB_AGENT_CONTROLLED_BETA_APPROVED: 'true', JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION: 'controlled-beta-1',
  JOB_AGENT_LAUNCH_EVIDENCE_SECRET: 'launch-evidence-secret'.padEnd(48, 'x'),
};
assert.equal(applicationSubmissionTaskWorkerConfiguration({}).reason, 'final-submission-durable-execution-disabled');
assert.equal(applicationSubmissionTaskWorkerConfiguration(env, { now: new Date('2026-08-30T17:00:00.000Z') }).reason, 'final-submission-supervised-execution-not-verified');
env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_EVIDENCE = JSON.stringify(buildJobAgentLaunchEvidence({
  kind: 'final-submission-execution', verifiedAt: '2026-08-30T16:00:00.000Z', evidenceId: 'submission-supervised-test-v1', artifactSha256: 'e'.repeat(64),
}, env));
assert.equal(applicationSubmissionTaskWorkerConfiguration(env, { now: new Date('2026-08-30T17:00:00.000Z') }).ready, true);
assert.equal(applicationSubmissionTaskWorkerConfiguration({ ...env, JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION: 'durable-beta-2' }, { now: new Date('2026-08-30T17:00:00.000Z') }).reason, 'final-submission-supervised-execution-not-verified');

function queuedSession() {
  let session = createApplicationSession({
    packageRunId: 'run_submission_worker_fixture', packageQaVerified: true, documentVersion: 'resume-v1', employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-1',
    directEmployerUrl: 'https://jobs.example.test/apply/REQ-1', proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact_email_fixture', maskedPreview: 'j•••@example.test', confidence: 1, provenance: 'user-confirmed', ordinaryVerified: true }],
  }, new Date('2026-08-30T17:00:00.000Z'));
  session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-30T17:01:00.000Z'));
  session = preserveApplicationFormCheckpoint(session, { pageUrl: session.role.directEmployerUrl, stepKey: 'employer-form', fieldSchemaHash: schemaHash, stagedFieldKeys: ['email'] }, new Date('2026-08-30T17:01:10.000Z'));
  session = reserveApplicationTransmission(session, { taskId: 'browser_task_for_submission', fieldSchemaHash: schemaHash, stagedFieldKeys: ['email'] }, new Date('2026-08-30T17:01:20.000Z'));
  session = beginReservedApplicationTransmission(session, { taskId: 'browser_task_for_submission' }, new Date('2026-08-30T17:01:30.000Z'));
  session = completeReservedApplicationTransmission(session, { taskId: 'browser_task_for_submission', transmittedFieldKeys: ['email'] }, new Date('2026-08-30T17:01:40.000Z'));
  session = requestApplicationSubmissionApproval(session, { confirmed: true }, new Date('2026-08-30T17:01:50.000Z'));
  session = confirmApplicationApproval(session, { kind: 'submission', confirmed: true }, new Date('2026-08-30T17:02:00.000Z'));
  return reserveApplicationSubmissionExecution(session, { taskId }, new Date('2026-08-30T17:02:01.000Z'));
}

const task = { id: taskId, payload: { sessionId: queuedSession().id, scopeHash: queuedSession().submissionExecution.scopeHash, documentVersion: 'resume-v1', fieldSchemaHash: schemaHash } };
const browserSession = { provider: 'remote-stream', providerSessionReference: 'remote_session_reference_001', viewMode: 'interactive-stream', interactive: true, employerHostname: 'jobs.example.test', pageUrl: 'https://jobs.example.test/apply/REQ-1', fieldSchemaHash: schemaHash, status: 'ready', expiresAt: '2026-08-30T18:00:00.000Z' };

function dependencies({ outcome = 'success', initialSession = queuedSession() } = {}) {
  const order = [];
  let current = initialSession;
  task.payload.sessionId = current.id;
  task.payload.scopeHash = current.submissionExecution.scopeHash;
  let version = 2;
  return {
    order,
    current: () => current,
    deps: {
      claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }),
      requireConsent: async () => ({ ok: true }),
      readSession: async () => ({ version, audit: { count: version }, ...current }),
      updateSession: async ({ session }) => { order.push(`session:${session.submissionExecution.status}`); current = session; version += 1; return { version, audit: { count: version }, ...current }; },
      startTask: async () => { order.push('task:started'); return { status: 'executing' }; },
      readBrowserSession: async () => browserSession,
      execute: async () => {
        order.push('provider:execute');
        assert.equal(order.indexOf('session:executing') < order.indexOf('provider:execute') || initialSession.submissionExecution.status === 'executing', true);
        assert.equal(order.indexOf('task:started') < order.indexOf('provider:execute'), true);
        if (outcome === 'throw') throw new Error('ambiguous provider timeout');
        if (outcome === 'unknown') return { status: 'outcome-unknown', submitted: 'unknown', externalApplicationExecution: true, retryable: false };
        if (outcome === 'not-started') return { status: 'not-started', code: 'CATEGORY_MONETARY_BUDGET_EXHAUSTED', submitted: false, externalApplicationExecution: false, retryable: false };
        return { status: 'attempt-recorded', submitted: true, submittedAt: '2026-08-30T17:02:11.000Z', responseFingerprint: 'c'.repeat(64), externalApplicationExecution: true };
      },
      prepareReceiptTask: ({ sessionId }) => ({ taskId: 'receipt_task_worker_fixture', record: { tenantId: 'a'.repeat(40) }, keys: ['a', 'b', 'c', 'd'], args: ['record', 'receipt_task_worker_fixture', '1', '2', '3'], sessionId }),
      finishTask: async ({ status }) => { order.push(`task:${status}`); return { status }; },
      clock: () => new Date('2026-08-30T17:02:10.000Z'),
    },
  };
}

const successDeps = dependencies();
const completed = await processNextApplicationSubmissionTask({ deps: successDeps.deps, env, now: new Date('2026-08-30T17:02:05.000Z') });
assert.equal(completed.status, 'attempt-recorded');
assert.equal(completed.authoritativeReceiptVerified, false);
assert.deepEqual(successDeps.order, ['session:executing', 'task:started', 'provider:execute', 'session:completed', 'task:completed']);
assert.equal(successDeps.current().stage, 'receipt_verification');
assert.equal(successDeps.current().receipt, null);

const unknownDeps = dependencies({ outcome: 'unknown' });
const unknown = await processNextApplicationSubmissionTask({ deps: unknownDeps.deps, env, now: new Date('2026-08-30T17:02:05.000Z') });
assert.equal(unknown.status, 'outcome-unknown');
assert.equal(unknown.submitted, 'unknown');
assert.deepEqual(unknownDeps.order, ['session:executing', 'task:started', 'provider:execute', 'session:outcome-unknown', 'task:outcome-unknown']);

const crashDeps = dependencies({ outcome: 'throw' });
const crash = await processNextApplicationSubmissionTask({ deps: crashDeps.deps, env, now: new Date('2026-08-30T17:02:05.000Z') });
assert.equal(crash.status, 'outcome-unknown');
assert.deepEqual(crashDeps.order, ['session:executing', 'task:started', 'provider:execute', 'session:outcome-unknown', 'task:outcome-unknown']);

const budgetDeps = dependencies({ outcome: 'not-started' });
const budgetBlocked = await processNextApplicationSubmissionTask({ deps: budgetDeps.deps, env, now: new Date('2026-08-30T17:02:05.000Z') });
assert.equal(budgetBlocked.status, 'not-started');
assert.equal(budgetBlocked.externalApplicationExecution, false);
assert.deepEqual(budgetDeps.order, ['session:executing', 'task:started', 'provider:execute', 'session:cancelled-before-provider', 'task:cancelled']);
assert.equal(budgetDeps.current().actions[0].type, 'SUBMISSION_APPROVAL');

const armed = beginReservedApplicationSubmission(queuedSession(), { taskId }, new Date('2026-08-30T17:02:05.000Z'));
const recoveryDeps = dependencies({ initialSession: armed });
const recovered = await processNextApplicationSubmissionTask({ deps: recoveryDeps.deps, env, now: new Date('2026-08-30T17:02:06.000Z') });
assert.equal(recovered.status, 'attempt-recorded');
assert.deepEqual(recoveryDeps.order, ['task:started', 'provider:execute', 'session:completed', 'task:completed']);

let revokedSession = queuedSession();
const revoked = await processNextApplicationSubmissionTask({ env, now: new Date('2026-08-30T17:02:05.000Z'), deps: {
  claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }), requireConsent: async () => ({ ok: false, code: 'JOB_AGENT_CONSENT_REQUIRED' }),
  cancelTask: async () => ({ status: 'cancelled' }), readSession: async () => ({ version: 2, audit: { count: 2 }, ...revokedSession }),
  updateSession: async ({ session }) => { revokedSession = session; return { version: 3, ...session }; },
} });
assert.equal(revoked.status, 'cancelled');
assert.equal(revoked.externalApplicationExecution, false);
assert.equal(revokedSession.submissionExecution.status, 'cancelled');

let missingBrowserSession = queuedSession();
const missingBrowserOrder = [];
const missingBrowser = await processNextApplicationSubmissionTask({ env, now: new Date('2026-08-30T17:02:05.000Z'), deps: {
  claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }), requireConsent: async () => ({ ok: true }),
  readSession: async () => ({ version: 2, audit: { count: 2 }, ...missingBrowserSession }),
  updateSession: async ({ session }) => { missingBrowserSession = session; missingBrowserOrder.push(`session:${session.submissionExecution.status}`); return { version: 3, ...session }; },
  readBrowserSession: async () => null,
  cancelTask: async ({ reasonCode }) => { missingBrowserOrder.push(`task:${reasonCode}`); return { status: 'cancelled' }; },
  clock: () => new Date('2026-08-30T17:02:10.000Z'),
} });
assert.equal(missingBrowser.status, 'not-started');
assert.equal(missingBrowser.externalApplicationExecution, false);
assert.deepEqual(missingBrowserOrder, ['session:executing', 'session:cancelled-before-provider', 'task:SUBMISSION_BROWSER_SESSION_MISSING']);

let finalRevocationSession = queuedSession();
let consentChecks = 0;
const finalRevocationOrder = [];
const finalRevocation = await processNextApplicationSubmissionTask({ env, now: new Date('2026-08-30T17:02:05.000Z'), deps: {
  claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }),
  requireConsent: async () => (++consentChecks < 3 ? { ok: true } : { ok: false, code: 'JOB_AGENT_AUTHORIZATION_REVOKED' }),
  readSession: async () => ({ version: 2, audit: { count: 2 }, ...finalRevocationSession }),
  updateSession: async ({ session }) => { finalRevocationSession = session; finalRevocationOrder.push(`session:${session.submissionExecution.status}`); return { version: 3, ...session }; },
  readBrowserSession: async () => browserSession,
  cancelTask: async ({ reasonCode }) => { finalRevocationOrder.push(`task:${reasonCode}`); return { status: 'cancelled' }; },
  clock: () => new Date('2026-08-30T17:02:10.000Z'),
} });
assert.equal(finalRevocation.status, 'cancelled');
assert.equal(finalRevocation.externalApplicationExecution, false);
assert.deepEqual(finalRevocationOrder, ['session:executing', 'session:cancelled-before-provider', 'task:JOB_AGENT_AUTHORIZATION_REVOKED']);

let expiredCurrent = queuedSession();
const expiredOrder = [];
const expired = await processNextApplicationSubmissionTask({ env, now: new Date('2026-08-30T17:16:59.000Z'), deps: {
  claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }), requireConsent: async () => ({ ok: true }),
  readSession: async () => ({ version: 2, audit: { count: 2 }, ...expiredCurrent }),
  updateSession: async ({ session }) => { expiredCurrent = session; expiredOrder.push(`session:${session.submissionExecution.status}`); return { version: 3, ...session }; },
  cancelTask: async ({ reasonCode }) => { expiredOrder.push(`task:${reasonCode}`); return { status: 'cancelled' }; },
  clock: () => new Date('2026-08-30T17:17:01.000Z'),
} });
assert.equal(expired.status, 'approval-expired');
assert.deepEqual(expiredOrder, ['session:cancelled', 'task:SUBMISSION_APPROVAL_EXPIRED']);
assert.equal(expiredCurrent.actions[0].type, 'SUBMISSION_APPROVAL');

let staleSession = beginReservedApplicationSubmission(queuedSession(), { taskId }, new Date('2026-08-30T17:02:05.000Z'));
let acknowledged = false;
const reconciled = await reconcileNextStaleApplicationSubmissionTask({ now: new Date('2026-08-30T17:10:00.000Z'), deps: {
  markStale: async () => ({ task, tenantId: 'a'.repeat(40) }), readSession: async () => ({ version: 5, audit: { count: 5 }, ...staleSession }),
  updateSession: async ({ session }) => { staleSession = session; return { version: 6, ...session }; }, acknowledge: async () => { acknowledged = true; },
} });
assert.equal(reconciled.status, 'outcome-unknown');
assert.equal(staleSession.submissionExecution.status, 'outcome-unknown');
assert.equal(acknowledged, true);

console.log('Submission task worker approval ordering, consent gate, pre-provider recovery, expiry, one-attempt completion, and outcome-unknown reconciliation tests passed.');
