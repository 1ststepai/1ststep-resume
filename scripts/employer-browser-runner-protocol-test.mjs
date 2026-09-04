import assert from 'node:assert/strict';
import {
  createEmployerBrowserInspectionRequest, createEmployerBrowserRunnerRequest, employerBrowserRunnerArtifactConfiguration,
  materializeApprovedEmployerFields, runEmployerBrowserArtifact, runEmployerBrowserInspectionArtifact,
} from '../lib/employer-browser-runner-protocol.js';

const digest = 'a'.repeat(64);
const artifact = employerBrowserRunnerArtifactConfiguration({
  EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: 'runner-v1',
  EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: digest,
  EMPLOYER_BROWSER_WORKER_RUNNER_PATH: '/opt/1ststep/employer-browser-runner.mjs',
});
assert.equal(artifact.ready, true);
assert.equal(employerBrowserRunnerArtifactConfiguration({}).reason, 'runner-version-not-configured');
assert.equal(employerBrowserRunnerArtifactConfiguration({ EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: 'runner-v1' }).reason, 'runner-digest-not-configured');
assert.equal(employerBrowserRunnerArtifactConfiguration({ EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: 'runner-v1', EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: digest, EMPLOYER_BROWSER_WORKER_RUNNER_PATH: '/tmp/runner.mjs' }).reason, 'runner-path-invalid');

const plan = {
  status: 'ready-to-fill', target: { hostname: 'jobs.example.test', pageUrl: 'https://jobs.example.test/apply/REQ-1' },
  fieldSchemaHash: 'b'.repeat(64),
  stagedFields: [{ fieldRef: 'field_first', fieldKey: 'firstName', factId: 'fact_first' }, { fieldRef: 'field_email', fieldKey: 'email', factId: 'fact_email' }],
};
const vault = {
  consent: { status: 'granted', scopes: ['confirmed-facts'] },
  facts: [
    { id: 'fact_first', fieldKey: 'firstName', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'Jordan', verificationState: 'user-confirmed', confidence: 1, autoReuse: true, revokedAt: null }] },
    { id: 'fact_email', fieldKey: 'email', status: 'active', currentVersion: 2, versions: [{ version: 1, value: 'old@example.test', verificationState: 'user-confirmed', confidence: 1, autoReuse: true }, { version: 2, value: 'jordan@example.test', verificationState: 'user-confirmed', confidence: .99, autoReuse: true, revokedAt: null }] },
  ],
};
const materialized = materializeApprovedEmployerFields(plan, vault);
assert.deepEqual(materialized.map(item => item.value), ['Jordan', 'jordan@example.test']);
assert.equal(createEmployerBrowserRunnerRequest(plan, materialized, artifact).constraints.submit, false);
assert.throws(() => materializeApprovedEmployerFields(plan, { ...vault, consent: { status: 'revoked', scopes: [] } }), /CONSENT_REQUIRED/);
assert.throws(() => materializeApprovedEmployerFields(plan, { ...vault, facts: vault.facts.map(item => item.id === 'fact_email' ? { ...item, status: 'revoked' } : item) }), /NO_LONGER_REUSABLE/);
assert.throws(() => materializeApprovedEmployerFields(plan, { ...vault, facts: vault.facts.map(item => item.id === 'fact_email' ? { ...item, fieldKey: 'phone' } : item) }), /NO_LONGER_REUSABLE/);

let written;
let command;
let removed = false;
const sandbox = {
  async writeFiles(files) { written = files; },
  async runCommand(cmd, args, options) {
    if (cmd === 'rm') { removed = true; return { exitCode: 0 }; }
    command = { cmd, args, options };
    return { exitCode: 0 };
  },
  async readFileToBuffer() {
    return Buffer.from(JSON.stringify({
      protocolVersion: 1, operation: 'fill-without-submit', runnerVersion: artifact.runnerVersion, runnerSha256: artifact.runnerSha256,
      pageUrl: `${plan.target.pageUrl}?step=2`, fieldSchemaHash: plan.fieldSchemaHash,
      stagedFieldKeys: ['email', 'firstName'], submitted: false, clickedSubmit: false, valuesRetained: false,
    }));
  },
};
const result = await runEmployerBrowserArtifact(sandbox, { plan, materializedFields: materialized, artifact });
assert.equal(result.submitted, false);
assert.equal(written[0].mode, 0o600);
assert.equal(command.cmd, 'node');
assert.equal(command.args.includes('Jordan'), false);
assert.equal(command.args.includes('jordan@example.test'), false);
assert.equal(removed, true);
assert.equal(JSON.parse(written[0].content).fields[1].value, 'jordan@example.test');

const badSandbox = { ...sandbox, async readFileToBuffer() { return Buffer.from(JSON.stringify({ protocolVersion: 1, operation: 'fill-without-submit', runnerVersion: 'wrong', runnerSha256: digest, fieldSchemaHash: plan.fieldSchemaHash, submitted: false })); } };
await assert.rejects(() => runEmployerBrowserArtifact(badSandbox, { plan, materializedFields: materialized, artifact }), /ATTESTATION_FAILED/);

const inspectionRequest = createEmployerBrowserInspectionRequest(plan.target, artifact);
assert.equal(inspectionRequest.constraints.includeFieldValues, false);
assert.equal(JSON.stringify(inspectionRequest).includes('jordan@example.test'), false);
let inspectionRemoved = false;
const inspectionSandbox = {
  async writeFiles(files) { assert.equal(files[0].mode, 0o600); },
  async runCommand(cmd, args) { if (cmd === 'rm') inspectionRemoved = true; else assert.equal(args.includes('Jordan'), false); return { exitCode: 0 }; },
  async readFileToBuffer() { return Buffer.from(JSON.stringify({
    protocolVersion: 1, operation: 'inspect-form-schema', runnerVersion: artifact.runnerVersion, runnerSha256: artifact.runnerSha256,
    pageUrl: plan.target.pageUrl, fields: [{ fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true }],
    submitted: false, clickedControls: false, valuesRetained: false,
  })); },
};
const inspected = await runEmployerBrowserInspectionArtifact(inspectionSandbox, { target: plan.target, artifact });
assert.deepEqual(inspected.fields, [{ fieldRef: 'field_first', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true }]);
assert.equal(inspectionRemoved, true);
const valueLeakingInspection = { ...inspectionSandbox, async readFileToBuffer() { return Buffer.from(JSON.stringify({
  protocolVersion: 1, operation: 'inspect-form-schema', runnerVersion: artifact.runnerVersion, runnerSha256: artifact.runnerSha256,
  pageUrl: plan.target.pageUrl, fields: [{ fieldRef: 'field_email', fieldKey: 'email', label: 'Email', inputType: 'email', required: true, value: 'leak@example.test' }],
})); } };
await assert.rejects(() => runEmployerBrowserInspectionArtifact(valueLeakingInspection, { target: plan.target, artifact }), /INSPECTION_VALUE_FORBIDDEN/);

console.log('Employer browser runner attestation, value-free schema inspection, active-vault materialization, no-submit request, private-file handoff, and cleanup tests passed.');
