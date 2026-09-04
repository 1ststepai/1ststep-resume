import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmApplicationApproval, createApplicationSession } from '../lib/application-session-domain.js';
import {
  assertVerifiedEmployerNavigation, employerBrowserWorkerConfiguration, executeEmployerBrowserCheckpoint, executeEmployerBrowserInspection, planEmployerFormStep, validateEmployerWorkerCheckpoint,
} from '../lib/employer-browser-worker.js';
import { orchestrateEmployerBrowserCheckpoint } from '../lib/employer-browser-orchestrator.js';

const enabledWorkerEnv = {
  EMPLOYER_BROWSER_WORKER_ENABLED: 'true', EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID: 'snap_browserfixture',
  EMPLOYER_BROWSER_ACCOUNT_DAILY_UNITS: '5', EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS: '30',
  EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: 'runner-v1', EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: 'a'.repeat(64),
  EMPLOYER_BROWSER_DURABLE_EXECUTION_ENABLED: 'true',
};

assert.deepEqual(employerBrowserWorkerConfiguration({}), { enabled: false, reason: 'disabled' });
assert.deepEqual(employerBrowserWorkerConfiguration({ EMPLOYER_BROWSER_WORKER_ENABLED: 'true' }), { enabled: false, reason: 'snapshot-not-configured' });
assert.deepEqual(employerBrowserWorkerConfiguration({ EMPLOYER_BROWSER_WORKER_ENABLED: 'true', EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID: 'snap_browserfixture' }), { enabled: false, reason: 'budget-not-configured' });
assert.equal(employerBrowserWorkerConfiguration(enabledWorkerEnv).enabled, true);

const startedAt = new Date('2026-08-29T20:00:00.000Z');
let session = createApplicationSession({
  packageRunId: 'run_fixture_browser', packageQaVerified: true, documentVersion: 'fixture-v1',
  employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-100',
  directEmployerUrl: 'https://jobs.example.test/apply/REQ-100',
  proposedFields: [
    { fieldKey: 'firstName', label: 'First name', factId: 'fact_first_name', maskedPreview: 'J••••', confidence: 1, provenance: 'candidate-confirmed', ordinaryVerified: true },
    { fieldKey: 'email', label: 'Email', factId: 'fact_email', maskedPreview: 'j••••@example.test', confidence: 0.99, provenance: 'candidate-confirmed', ordinaryVerified: true },
  ],
}, startedAt);
session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T20:01:00.000Z'));

assert.equal(assertVerifiedEmployerNavigation(session, 'https://jobs.example.test/apply/REQ-100?page=2').hostname, 'jobs.example.test');
assert.throws(() => assertVerifiedEmployerNavigation(session, 'https://evil.example/apply/REQ-100'), /HOST_MISMATCH/);
assert.throws(() => assertVerifiedEmployerNavigation(session, 'https://127.0.0.1/apply'), /TARGET_INVALID/);

const ordinary = planEmployerFormStep({
  session, now: new Date('2026-08-29T20:02:00.000Z'), pageUrl: 'https://jobs.example.test/apply/REQ-100',
  fields: [
    { fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', required: true },
    { fieldRef: 'field_email', fieldKey: 'email', label: 'Email address', inputType: 'email', required: true },
    { fieldRef: 'field_demographic', fieldKey: 'veteranStatus', label: 'Veteran status (optional)', required: false },
  ],
});
assert.equal(ordinary.status, 'ready-to-fill');
assert.deepEqual(ordinary.stagedFields.map(item => item.fieldKey), ['firstName', 'email']);
assert.deepEqual(ordinary.leftUnanswered.map(item => item.fieldKey), ['veteranStatus']);
assert.equal(JSON.stringify(ordinary).includes('j••••@example.test'), false);
assert.equal(ordinary.finalSubmissionAuthorized, false);

const ordinaryCheckbox = planEmployerFormStep({
  session, now: new Date('2026-08-29T20:02:00.000Z'), pageUrl: 'https://jobs.example.test/apply/REQ-100',
  fields: [{ fieldRef: 'field_email_checkbox', fieldKey: 'email', label: 'Use this email certification', inputType: 'checkbox', required: true }],
});
assert.equal(ordinaryCheckbox.status, 'waiting-for-user');
assert.equal(ordinaryCheckbox.stagedFields.length, 0);
assert.equal(ordinaryCheckbox.actions[0].type, 'NONSTANDARD_CERTIFICATION');

const checkpoint = validateEmployerWorkerCheckpoint(ordinary, {
  pageUrl: 'https://jobs.example.test/apply/REQ-100?page=2', fieldSchemaHash: ordinary.fieldSchemaHash,
  stagedFieldKeys: ['email', 'firstName'], submitted: false,
});
assert.equal(checkpoint.checkpointStatus, 'preserved');
assert.equal(checkpoint.transmission, 'not-recorded');
assert.throws(() => validateEmployerWorkerCheckpoint(ordinary, { ...checkpoint, submitted: true }), /CONSEQUENTIAL_RESULT_FORBIDDEN/);

const blocked = planEmployerFormStep({
  session, now: new Date('2026-08-29T20:02:00.000Z'), pageUrl: 'https://jobs.example.test/apply/REQ-100',
  fields: [
    { fieldRef: 'field_password', fieldKey: 'accountPassword', label: 'Password', inputType: 'password', required: true },
    { fieldRef: 'field_resume', fieldKey: 'unknownField1', label: 'Resume upload', inputType: 'file', required: true },
    { fieldRef: 'field_otp', fieldKey: 'verification', label: 'One-time verification code', required: true },
    { fieldRef: 'field_captcha', fieldKey: 'challenge', label: 'CAPTCHA', inputType: 'captcha', required: true },
    { fieldRef: 'field_identity', fieldKey: 'identityCheck', label: 'Government ID verification', required: true },
    { fieldRef: 'field_cert', fieldKey: 'attestation', label: 'Electronic certification under penalty', required: true },
    { fieldRef: 'field_conflict', fieldKey: 'outsideWork', label: 'Outside employment conflict', required: true },
    { fieldRef: 'field_clearance', fieldKey: 'clearance', label: 'Security clearance', required: true },
  ],
});
assert.equal(blocked.status, 'waiting-for-user');
assert.deepEqual(blocked.actions.map(item => item.type), [
  'LOGIN', 'DOCUMENT_UPLOAD', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION', 'NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT', 'AMBIGUOUS_FACT',
]);
assert.equal(blocked.actions.at(-1).riskCategory, 'eligibility-screening');
assert.equal(blocked.actions.at(-1).canSkipJob, true);
assert.match(blocked.actions.at(-1).summary, /Potential eligibility screen/);
assert.throws(() => validateEmployerWorkerCheckpoint(blocked, {}), /PLAN_BLOCKED/);
assert.throws(() => planEmployerFormStep({ session, now: new Date('2026-08-29T20:20:00.000Z'), fields: [] }), /APPROVAL_REQUIRED/);
assert.throws(() => planEmployerFormStep({ session, now: new Date('2026-08-29T20:02:00.000Z'), fields: [{ fieldRef: 'field_bad', fieldKey: 'email', label: 'Email', value: 'candidate@example.test' }] }), /FIELD_VALUES_FORBIDDEN/);

let createOptions = null;
let stopped = false;
const FakeSandbox = {
  async create(options) {
    createOptions = options;
    return { async stop() { stopped = true; } };
  },
};
const disabledExecution = await executeEmployerBrowserCheckpoint({ plan: ordinary, env: {}, SandboxImpl: FakeSandbox, run: async () => ({}) });
assert.equal(disabledExecution.status, 'not-configured');
assert.equal(createOptions, null);
const executed = await executeEmployerBrowserCheckpoint({
  plan: ordinary,
  env: enabledWorkerEnv,
  SandboxImpl: FakeSandbox,
  run: async (_sandbox, input) => ({
    pageUrl: `${input.target.pageUrl}?step=2`, fieldSchemaHash: input.fieldSchemaHash,
    stagedFieldKeys: input.stagedFields.map(item => item.fieldKey), submitted: false,
  }),
});
assert.deepEqual(createOptions.networkPolicy, { allow: ['jobs.example.test'] });
assert.deepEqual(createOptions.source, { type: 'snapshot', snapshotId: 'snap_browserfixture' });
assert.equal(executed.status, 'checkpoint-preserved');
assert.equal(executed.checkpoint.submission, 'none');
assert.equal(stopped, true);
stopped = false;
await assert.rejects(() => executeEmployerBrowserCheckpoint({
  plan: ordinary,
  env: enabledWorkerEnv,
  SandboxImpl: FakeSandbox,
  run: async () => { throw new Error('synthetic crash'); },
}), /synthetic crash/);
assert.equal(stopped, true);

stopped = false;
const inspected = await executeEmployerBrowserInspection({
  session, pageUrl: 'https://jobs.example.test/apply/REQ-100', env: enabledWorkerEnv, SandboxImpl: FakeSandbox,
  run: async (_sandbox, input) => ({
    pageUrl: `${input.target.pageUrl}?step=1`,
    fields: [{ fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true }],
  }),
});
assert.equal(inspected.status, 'inspected');
assert.equal(inspected.fields[0].fieldKey, 'firstName');
assert.equal(stopped, true);
await assert.rejects(() => executeEmployerBrowserInspection({
  session, env: enabledWorkerEnv, SandboxImpl: FakeSandbox,
  run: async () => ({ pageUrl: 'https://evil.example/form', fields: [] }),
}), /HOST_MISMATCH/);
await assert.rejects(() => executeEmployerBrowserInspection({
  session, env: enabledWorkerEnv, SandboxImpl: FakeSandbox,
  run: async () => ({ pageUrl: session.role.directEmployerUrl, fields: [{ fieldRef: 'field_email', fieldKey: 'email', label: 'Email', value: 'leak@example.test' }] }),
}), /FIELD_VALUES_FORBIDDEN/);

stopped = false;
await assert.rejects(() => executeEmployerBrowserCheckpoint({
  plan: ordinary,
  env: enabledWorkerEnv,
  SandboxImpl: FakeSandbox,
}), /VAULT_CONSENT_REQUIRED/);
assert.equal(stopped, true);

let executedBlockedPlan = false;
const blockedOrchestration = await orchestrateEmployerBrowserCheckpoint({
  session, pageUrl: 'https://jobs.example.test/apply/REQ-100', fields: [
    { fieldRef: 'field_password', fieldKey: 'accountPassword', label: 'Password', inputType: 'password', required: true },
    { fieldRef: 'field_veteran', fieldKey: 'veteranStatus', label: 'Veteran status', required: false },
  ], now: new Date('2026-08-29T20:03:00.000Z'),
  execute: async () => { executedBlockedPlan = true; },
});
assert.equal(executedBlockedPlan, false);
assert.equal(blockedOrchestration.session.state, 'Waiting for You');
assert.equal(blockedOrchestration.session.actions.some(item => item.type === 'LOGIN' && item.status === 'open'), true);
assert.equal(blockedOrchestration.session.formCheckpoint.status, 'preserved');
assert.equal(JSON.stringify(blockedOrchestration).includes('Veteran status'), false);

const disabledOrchestration = await orchestrateEmployerBrowserCheckpoint({
  session, pageUrl: 'https://jobs.example.test/apply/REQ-100', fields: [
    { fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', required: true },
  ], now: new Date('2026-08-29T20:03:00.000Z'), env: {},
});
assert.equal(disabledOrchestration.executionStatus, 'not-configured');
assert.equal(disabledOrchestration.session.state, 'Paused');
assert.equal(disabledOrchestration.session.worker.valuesRetained, false);
assert.equal(disabledOrchestration.session.worker.submitted, false);

const persistedOrchestration = await orchestrateEmployerBrowserCheckpoint({
  session, pageUrl: 'https://jobs.example.test/apply/REQ-100', fields: [
    { fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', required: true },
  ], now: new Date('2026-08-29T20:03:00.000Z'),
  execute: async ({ plan }) => ({ status: 'checkpoint-preserved', checkpoint: validateEmployerWorkerCheckpoint(plan, {
    pageUrl: 'https://jobs.example.test/apply/REQ-100?step=2', fieldSchemaHash: plan.fieldSchemaHash,
    stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey), submitted: false,
  }) }),
});
assert.equal(persistedOrchestration.executionStatus, 'checkpoint-preserved');
assert.equal(persistedOrchestration.session.state, 'Preparing');
assert.equal(persistedOrchestration.session.worker.isolated, true);
assert.equal(persistedOrchestration.session.formCheckpoint.pageUrl, 'https://jobs.example.test/apply/REQ-100?step=2');

const applicationSessionApi = await readFile(new URL('../api/application-sessions.js', import.meta.url), 'utf8');
assert.match(applicationSessionApi, /action === 'prepare-employer-step'/);
assert.match(applicationSessionApi, /scope: 'employer-browser-worker'/);
assert.match(applicationSessionApi, /accountRule: \{ limit: workerConfig\.accountDailyUnits/);
assert.match(applicationSessionApi, /globalRule: \{ limit: workerConfig\.globalDailyUnits/);
assert.match(applicationSessionApi, /externalApplicationExecution: false/);

console.log('Fail-closed employer-browser configuration, exact-host navigation, durable orchestration, ordinary-fill planning, human gates, secret rejection, budgets, teardown, and no-submit checkpoint tests passed.');
