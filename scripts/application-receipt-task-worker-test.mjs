import assert from 'node:assert/strict';
import { applicationReceiptTaskWorkerConfiguration, processNextApplicationReceiptTask } from '../lib/application-receipt-task-worker.js';

const env = {
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid',
  EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/', EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'browser-key'.padEnd(48, 'x'),
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'cost-v1', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-v1', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'capture-v1',
  JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts', JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test', JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page', JOB_AGENT_RECEIPT_SECRET: 'receipt-secret'.padEnd(48, 'x'),
  JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION: 'receipt-worker-v1',
};
assert.equal(applicationReceiptTaskWorkerConfiguration({}).ready, false);
assert.equal(applicationReceiptTaskWorkerConfiguration(env).ready, true);

const taskId = 'receipt_task_worker_001';
const tenantId = 'a'.repeat(40);
const task = { id: taskId, attempt: 1, createdAt: '2026-08-30T18:00:00.000Z', payload: { sessionId: 'application_receipt_worker_001', documentVersion: 'resume-v1', scopeHash: 'b'.repeat(64), responseFingerprint: 'c'.repeat(64), submittedAt: '2026-08-30T18:00:00.000Z', expectedSessionVersion: 4, kind: 'page' } };
const browserSession = { provider: 'remote-stream', providerSessionReference: 'browser_receipt_worker_001', employerHostname: 'jobs.example.test', pageUrl: 'https://jobs.example.test/confirmation', status: 'ready' };
function session() {
  return { id: task.payload.sessionId, documentVersion: 'resume-v1', state: 'Preparing', stage: 'receipt_verification', role: { employer: 'Example', title: 'Buyer', requisitionId: 'REQ-1', directEmployerUrl: 'https://jobs.example.test/apply/REQ-1' }, approvals: { submission: { consumedAt: '2026-08-30T18:00:00.000Z' } }, submissionAttempt: { scopeHash: 'b'.repeat(64), responseFingerprint: 'c'.repeat(64), submittedAt: '2026-08-30T18:00:00.000Z', authoritativeReceiptVerified: false }, receiptVerification: { id: taskId, status: 'queued', attempt: 0, lastCheckedAt: null, completedAt: null, failureCode: null }, receipt: null, actions: [], timeline: [], updatedAt: '2026-08-30T18:00:00.000Z' };
}
function baseDeps(current, overrides = {}) {
  let value = current;
  const events = [];
  return { events, current: () => value, deps: {
    claim: async () => ({ task, tenantId, leaseToken: 'lease-token' }), requireConsent: async () => ({ ok: true }),
    readSession: async () => ({ version: 4, audit: {}, ...value }), updateSession: async ({ session: next }) => { value = next; events.push(`session:${next.receiptVerification?.status}`); return { version: 5, ...next }; },
    readBrowserSession: async () => browserSession, collect: async () => ({ status: 'pending', code: 'AUTHORITATIVE_RECEIPT_NOT_YET_AVAILABLE', retryable: true }),
    capture: async () => ({ verified: false, outcome: 'unknown', code: 'RECEIPT_CAPTURE_OUTCOME_UNKNOWN' }),
    reschedule: async () => { events.push('task:rescheduled'); return { status: 'queued' }; },
    finish: async ({ status }) => { events.push(`task:${status}`); return { status }; }, ...overrides,
  } };
}

let fixture = baseDeps(session());
let result = await processNextApplicationReceiptTask({ env, deps: fixture.deps, now: new Date('2026-08-30T18:01:00.000Z') });
assert.equal(result.status, 'waiting');
assert.deepEqual(fixture.events, ['session:queued', 'task:rescheduled']);
assert.equal(fixture.current().timeline.at(-1).kind, 'AUTHORITATIVE_RECEIPT_PENDING');

fixture = baseDeps(session(), { collect: async () => ({ status: 'evidence', evidence: { kind: 'page' } }), capture: async ({ tenantId: id }) => { assert.equal(id, tenantId); return { verified: true, outcome: 'verified' }; } });
result = await processNextApplicationReceiptTask({ env, deps: fixture.deps, now: new Date('2026-08-30T18:01:00.000Z') });
assert.equal(result.status, 'verified');
assert.deepEqual(fixture.events, ['task:completed']);

fixture = baseDeps(session(), { readBrowserSession: async () => null });
result = await processNextApplicationReceiptTask({ env, deps: fixture.deps, now: new Date('2026-08-30T18:01:00.000Z') });
assert.equal(result.status, 'needs-human');
assert.deepEqual(fixture.events, ['session:needs-human', 'task:needs-human']);
assert.equal(fixture.current().actions[0].type, 'RECEIPT_VERIFICATION');

fixture = baseDeps(session(), { requireConsent: async () => ({ ok: false }) });
result = await processNextApplicationReceiptTask({ env, deps: fixture.deps, now: new Date('2026-08-30T18:01:00.000Z') });
assert.equal(result.status, 'cancelled');
assert.deepEqual(fixture.events, ['task:cancelled']);

const completedSession = { ...session(), receipt: { authority: 'employer-side' } };
fixture = baseDeps(completedSession);
result = await processNextApplicationReceiptTask({ env, deps: fixture.deps, now: new Date('2026-08-30T18:01:00.000Z') });
assert.equal(result.status, 'verified-from-session-checkpoint');
assert.deepEqual(fixture.events, ['task:completed']);

console.log('Receipt task worker verifies checkpoints, retries read-only checks, hands raw evidence directly to signed capture, pauses for human review, and honors revocation.');
