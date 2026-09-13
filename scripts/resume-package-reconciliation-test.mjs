import assert from 'node:assert/strict';
import { grantVaultConsent, revokeVaultFact, selectVaultBaseResume, syncCanonicalApplicantProfile, upsertVaultDocument, upsertVaultFact } from '../lib/applicant-vault-domain.js';
import { reconcilePackageResumeInput } from '../lib/resume-package-reconciliation.js';
import { validateApplicationPackageInput } from '../lib/job-agent-run-store.js';

const at = '2026-09-13T12:00:00.000Z';
const resume = title => 'Job Title: ' + title + '\nEmployer: Example Co\n' + 'Verified candidate work, education and skills. '.repeat(12);
const facts = [{ fieldKey: 'jobTitle', value: 'Senior Buyer', provenance: 'candidate confirmation',
  confidence: 1, verificationState: 'user-confirmed', originKind: 'candidate-confirmed', autoReuse: true }];
let vault = grantVaultConsent({ scopes: ['confirmed-facts', 'documents'] }, at);
vault = upsertVaultFact(vault, facts[0], at);
vault = upsertVaultDocument(vault, { type: 'master-resume', text: resume('Senior Buyer'), provenance: 'candidate-reviewed' }, at);
const doc = vault.documents[0];
const firstVersion = doc.versions[0];
vault = selectVaultBaseResume(vault, { documentId: doc.id, version: 1, reviewed: true }, at);
const selected = vault.selectedBaseResume;
assert.equal(selected.documentId, doc.id);
assert.equal(selected.version, 1);
assert.equal(selected.sha256, firstVersion.sha256);
assert.equal(selectVaultBaseResume(vault, { documentId: doc.id, version: 1, reviewed: true }, at).audit.length, vault.audit.length,
  'retrying selection never creates another authority record');

let resolved = reconcilePackageResumeInput({ vault, browserText: resume('Senior Buyer') });
assert.equal(resolved.status, 'ready');
assert.equal(resolved.resumeText, firstVersion.text);
assert.equal(resolved.baseResume.sha256, selected.sha256);
assert.equal(resolved.verifiedFacts.length, 1);
const mission = validateApplicationPackageInput({
  roleId: 'role_example', discoveryRunId: 'run_discovery_example', employer: 'Example Co',
  title: 'Senior Buyer', requisitionId: 'req-123', directEmployerUrl: 'https://jobs.example.com/req-123',
  applyPathActive: true, jobDescription: 'Published role description. '.repeat(12),
  resumeText: resolved.resumeText, baseResume: resolved.baseResume,
  verifiedFacts: resolved.verifiedFacts, verifiedFactsHash: resolved.verifiedFactsHash,
});
assert.deepEqual(mission.baseResume, resolved.baseResume, 'selected document/version/hash is pinned in package mission');
assert.equal(mission.verifiedFactsHash, resolved.verifiedFactsHash);
assert.throws(() => validateApplicationPackageInput({ ...mission, resumeText: resume('Buyer') }), /exact selected base resume identity/,
  'browser text cannot replace the pinned source without a hash mismatch');

vault = upsertVaultDocument(vault, { id: doc.id, type: 'master-resume', text: resume('Buyer'), provenance: 'legacy-import' }, at);
assert.equal(vault.documents[0].currentVersion, 2);
assert.equal(vault.selectedBaseResume.version, 1, 'a newer version does not silently become selected');
resolved = reconcilePackageResumeInput({ vault, browserText: resume('Buyer') });
assert.equal(resolved.status, 'needs-review');
assert.equal(resolved.resumeText, firstVersion.text, 'newer browser text cannot override selected version');
assert.ok(resolved.conflicts.some(item => item.type === 'BASE_DOCUMENT_DIVERGENCE'));
assert.equal(vault.documents[0].versions.length, 2, 'historical versions are preserved');

resolved = reconcilePackageResumeInput({ vault, browserText: resume('Buyer') });
assert.ok(resolved.conflicts.some(item => item.type === 'MATERIAL_FACT_MISMATCH'
  && item.values[0].value === 'Senior Buyer' && item.values[1].value === 'Buyer'),
  'verified fact and legacy claim are both exposed for review');
assert.equal(reconcilePackageResumeInput({ vault, browserText: '' }).status, 'ready',
  'the explicit historical selection remains usable when no different browser copy is presented');

vault = upsertVaultFact(vault, { fieldKey: 'metric', value: 'Saved 30%', provenance: 'AI-generated draft',
  originKind: 'generated', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, at);
vault = upsertVaultFact(vault, { fieldKey: 'certification', value: 'CPSM', provenance: 'resume parser',
  originKind: 'parsed-proposal', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, at);
resolved = reconcilePackageResumeInput({ vault, browserText: '' });
assert.equal(resolved.verifiedFacts.some(item => item.fieldKey === 'metric' || item.fieldKey === 'certification'), false,
  'generated and parsed claims never automatically become verified package facts');
assert.equal(resolved.status, 'ready', 'excluded proposals do not invalidate confirmed fact snapshot');

vault = upsertVaultFact(vault, { fieldKey: 'authorization', value: 'Eligible to work', provenance: 'candidate confirmation',
  originKind: 'candidate-confirmed', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, at);
resolved = reconcilePackageResumeInput({ vault, browserText: '' });
assert.equal(resolved.verifiedFacts.some(item => item.fieldKey === 'authorization'), false,
  'consequential facts cannot enter the resume package through automatic reuse');

const jobFactId = vault.facts.find(item => item.fieldKey === 'jobTitle').id;
vault = revokeVaultFact(vault, jobFactId, at);
resolved = reconcilePackageResumeInput({ vault, browserText: '' });
assert.equal(resolved.verifiedFacts.some(item => item.fieldKey === 'jobTitle'), false);
assert.equal(resolved.status, 'needs-review', 'revocation invalidates the selected fact snapshot');
assert.ok(resolved.conflicts.some(item => item.type === 'VERIFIED_FACTS_CHANGED'));
const selectedAgain = selectVaultBaseResume(vault, { documentId: doc.id, version: 1, reviewed: true }, at);
assert.equal(reconcilePackageResumeInput({ vault: selectedAgain, browserText: '' }).status, 'ready');
const replay = syncCanonicalApplicantProfile(selectedAgain, { masterResume: { text: resume('Buyer'), provenance: 'legacy-import' } }, at);
assert.equal(replay.documents[0].currentVersion, 2, 'idempotent sync does not duplicate document versions');
assert.equal(replay.selectedBaseResume.version, 1, 'sync cannot silently change explicit selection');

console.log('RESUME-001 selected base identity, browser non-override, conflict preservation, proposal exclusion, revocation, version history, and idempotency tests passed.');
