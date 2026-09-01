import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmApplicationApproval, createApplicationSession } from '../lib/application-session-domain.js';
import { grantVaultConsent, upsertVaultFact } from '../lib/applicant-vault-domain.js';
import { createExtensionHandoffToken, extensionApplicationHandoffConfiguration, materializeGreenhouseExtensionFields, planGreenhouseExtensionHandoff, verifyExtensionHandoffToken } from '../lib/extension-application-handoff.js';
import { verifiedResumeArtifact } from '../api/extension-application-handoff.js';

const now = new Date('2026-08-30T18:00:00.000Z');
const secret = 'extension-handoff-secret'.padEnd(48, 'x');
assert.deepEqual(extensionApplicationHandoffConfiguration({}), { ready: false, reason: 'disabled' });
assert.deepEqual(extensionApplicationHandoffConfiguration({ JOB_AGENT_EXTENSION_HANDOFF_ENABLED: 'true' }), { ready: false, reason: 'secret-not-configured' });
assert.equal(extensionApplicationHandoffConfiguration({ JOB_AGENT_EXTENSION_HANDOFF_ENABLED: 'true', JOB_AGENT_EXTENSION_HANDOFF_SECRET: secret }).ready, true);

let session = createApplicationSession({
  packageRunId: 'run_greenhouse_fixture', packageQaVerified: true, documentVersion: 'resume-greenhouse-v1',
  employer: 'Fixture Co', title: 'Procurement Manager', requisitionId: '123456',
  directEmployerUrl: 'https://boards.greenhouse.io/fixtureco/jobs/123456',
  proposedFields: [
    { fieldKey: 'firstName', label: 'First name', factId: 'fact_first_name', maskedPreview: 'J••••', confidence: 1, provenance: 'candidate-confirmed', ordinaryVerified: true },
    { fieldKey: 'email', label: 'Email', factId: 'fact_email_address', maskedPreview: 'j•••@example.test', confidence: 0.99, provenance: 'candidate-confirmed', ordinaryVerified: true },
  ],
}, now);
session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-30T18:01:00.000Z'));

const plan = planGreenhouseExtensionHandoff({
  session, now: new Date('2026-08-30T18:02:00.000Z'), pageUrl: 'https://boards.greenhouse.io/fixtureco/jobs/123456#1ststep-session=x',
  fields: [
    { fieldRef: 'first_name', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true },
    { fieldRef: 'email_address', fieldKey: 'email', label: 'Email', inputType: 'email', required: true },
    { fieldRef: 'resume_upload', fieldKey: 'resumeDocument', label: 'Resume upload', inputType: 'file', required: true },
    { fieldRef: 'veteran_status', fieldKey: 'veteranStatus', label: 'Veteran status', inputType: 'select', required: false },
  ],
});
assert.equal(plan.status, 'ready-to-fill');
assert.equal(plan.provider, 'greenhouse');
assert.deepEqual(plan.stagedFields.map(field => field.fieldKey), ['firstName', 'email', 'resumeDocument']);
assert.deepEqual(plan.documentUpload, { fieldRef: 'resume_upload', fieldKey: 'resumeDocument', documentVersion: 'resume-greenhouse-v1' });
assert.equal(plan.finalSubmissionAuthorized, false);
assert.equal(JSON.stringify(plan).includes('example.test'), false);
assert.throws(() => planGreenhouseExtensionHandoff({ session, pageUrl: 'https://boards.greenhouse.io/fixtureco/jobs/999999', fields: [] }), /REQUISITION_MISMATCH/);
assert.throws(() => planGreenhouseExtensionHandoff({ session, pageUrl: 'https://evil.example/jobs/123456', fields: [] }), /TARGET_INVALID/);
assert.throws(() => planGreenhouseExtensionHandoff({ session, pageUrl: session.role.directEmployerUrl, fields: [{ fieldRef: 'email_address', fieldKey: 'email', label: 'Email', value: 'leak@example.test' }] }), /FIELD_VALUES_FORBIDDEN/);

let vault = grantVaultConsent({ scopes: ['confirmed-facts', 'documents'] }, now);
vault = upsertVaultFact(vault, { id: 'fact_first_name', fieldKey: 'firstName', label: 'First name', value: 'Jordan', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1, sensitivity: 'standard', autoReuse: true }, now);
vault = upsertVaultFact(vault, { id: 'fact_email_address', fieldKey: 'email', label: 'Email', value: 'jordan@example.test', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 0.99, sensitivity: 'standard', autoReuse: true }, now);
const fields = materializeGreenhouseExtensionFields(plan, vault);
assert.deepEqual(fields.map(field => field.fieldKey), ['firstName', 'email']);
assert.equal(fields[1].value, 'jordan@example.test');
const nonReusable = structuredClone(vault);
nonReusable.facts.find(fact => fact.id === 'fact_email_address').versions[0].autoReuse = false;
assert.throws(() => materializeGreenhouseExtensionFields(plan, nonReusable), /VAULT_FACT_NOT_REUSABLE:email/);

const token = createExtensionHandoffToken({
  sessionId: session.id, recordVersion: 2, approvalId: session.approvals.transmission.id, taskId: 'extension_fixture_task',
  fieldSchemaHash: plan.fieldSchemaHash, stagedFields: plan.stagedFields, pageUrl: plan.target.pageUrl, secret,
  now: new Date('2026-08-30T18:02:00.000Z'),
});
const claims = verifyExtensionHandoffToken(token, { secret, now: new Date('2026-08-30T18:03:00.000Z') });
assert.equal(claims.sessionId, session.id);
assert.equal(JSON.stringify(claims).includes('Jordan'), false);
assert.throws(() => verifyExtensionHandoffToken(`${token.slice(0, -1)}a`, { secret }), /TOKEN_INVALID/);
assert.throws(() => verifyExtensionHandoffToken(token, { secret, now: new Date('2026-08-30T18:05:00.001Z') }), /TOKEN_EXPIRED/);

const resumeArtifact = { key: 'resume_pdf', filename: 'fixture-role-resume.pdf', contentType: 'application/pdf', bytes: 500, sha256: 'a'.repeat(64) };
const packageRun = {
  taskType: 'application_package', status: 'Finished', result: {
    documentVersion: session.documentVersion, artifacts: [resumeArtifact],
    qa: { visualPageInspection: true, pagesInspected: true, issues: [] },
    renderEvidence: { complete: true, documentVersion: session.documentVersion },
  },
};
assert.equal(verifiedResumeArtifact(packageRun, session), resumeArtifact);
assert.throws(() => verifiedResumeArtifact({ ...packageRun, result: { ...packageRun.result, documentVersion: 'different-version' } }, session), /RESUME_NOT_READY/);
assert.throws(() => verifiedResumeArtifact({ ...packageRun, result: { ...packageRun.result, renderEvidence: { complete: false, documentVersion: session.documentVersion } } }, session), /RESUME_NOT_READY/);
assert.throws(() => verifiedResumeArtifact({ ...packageRun, result: { ...packageRun.result, artifacts: [{ ...resumeArtifact, sha256: 'invalid' }] } }, session), /ARTIFACT_INVALID/);

const api = await readFile(new URL('../api/extension-application-handoff.js', import.meta.url), 'utf8');
assert.match(api, /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/);
assert.match(api, /jobAgentAccessAllowed/);
assert.match(api, /jobAgentConsentGate/);
assert.match(api, /beginReservedApplicationTransmission/);
assert.match(api, /updateDurableApplicationSession[\s\S]*candidateValuesReturned: true/);
assert.match(api, /completeReservedApplicationTransmission/);
assert.match(api, /failReservedApplicationTransmission/);
assert.match(api, /notifyNewApplicationNeedsYouAction/);
assert.match(api, /readApplicationPackageArtifact/);
assert.match(api, /GREENHOUSE_APPROVED_RESUME_NOT_READY/);
assert.match(api, /contentBase64: bytes\.toString\('base64'\)/);
assert.match(api, /submitted: false, receiptVerified: false/);

console.log('Single-use Greenhouse extension handoff, exact requisition, reusable vault facts, integrity-checked resume metadata, signed expiry, no-submit completion, and fail-closed tests passed.');
