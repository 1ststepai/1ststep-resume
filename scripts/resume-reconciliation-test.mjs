import assert from 'node:assert/strict';
import { reconcileResumeSources, firstJobTitleFact } from '../client/resume-reconciliation.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const base = (value, overrides = {}) => ({ id: 'browser:a', version: '1', hash: A, source: 'concierge-reviewed',
  selected: true, reviewed: true, timestamp: '2026-09-10T00:00:00Z',
  facts: [{ fieldKey: 'jobTitle', entityKey: 'primary-role', value, source: 'browser' }], ...overrides });
const confirmed = (value, overrides = {}) => ({ fieldKey: 'jobTitle', entityKey: 'primary-role', value,
  source: 'saved-info', provenance: 'user entry', verificationState: 'user-confirmed',
  timestamp: '2026-09-09T00:00:00Z', ...overrides });

// 1. Consistent reviewed document and confirmed fact.
let result = reconcileResumeSources({ resumes: [base('Senior Buyer')], facts: [confirmed('senior buyer')] });
assert.equal(result.packageReadiness, 'READY');
assert.equal(result.conflicts.length, 0);

// 2. Preserve both sides of a material disagreement.
result = reconcileResumeSources({ resumes: [base('Buyer')], facts: [confirmed('Senior Buyer')] });
assert.equal(result.packageReadiness, 'NEEDS_REVIEW');
assert.deepEqual(result.conflicts[0].values.map(item => item.value), ['Senior Buyer', 'Buyer']);

// 3. Generated metric remains generated even if a caller supplies a verification flag.
result = reconcileResumeSources({ resumes: [base('Senior Buyer')], facts: [confirmed('Senior Buyer'),
  { fieldKey: 'metric', value: 'Reduced costs by 30%', originKind: 'generated', verificationState: 'user-confirmed', source: 'AI' }] });
assert.equal(result.confirmedFacts.some(fact => fact.fieldKey === 'metric'), false);
assert.equal(result.generatedOnlyFacts[0].value, 'Reduced costs by 30%');

// 4. An extracted certification is only a proposal.
result = reconcileResumeSources({ resumes: [base('Senior Buyer')], facts: [
  { fieldKey: 'certification', value: 'CPSM', originKind: 'parsed-proposal', source: 'resume-parser' }] });
assert.equal(result.confirmedFacts.length, 0);
assert.equal(result.unverifiedFacts[0].kind, 'parsed-proposal');

// 5. Revoked Vault fact is excluded from package authority and conflicts.
result = reconcileResumeSources({ resumes: [base('Buyer')], facts: [confirmed('Senior Buyer', { source: 'applicant-vault', status: 'revoked' })] });
assert.equal(result.confirmedFacts.length, 0);
assert.equal(result.packageReadiness, 'READY');

// 6. Explicit selection retains another version as history, not another base.
result = reconcileResumeSources({ resumes: [base('Senior Buyer'), base('Buyer', { id: 'vault:old', version: '0', hash: B, selected: false, reviewed: true, current: false })], facts: [confirmed('Senior Buyer')] });
assert.equal(result.selectedBaseResume.id, 'browser:a');
assert.equal(result.packageReadiness, 'READY');

// 7. A newer generated document cannot outrank an older confirmed fact.
result = reconcileResumeSources({ resumes: [base('Buyer', { timestamp: '2026-09-12T00:00:00Z' })], facts: [confirmed('Senior Buyer')] });
assert.equal(result.packageReadiness, 'NEEDS_REVIEW');
assert.equal(result.confirmedFacts[0].value, 'Senior Buyer');

// 8. Legacy-only text remains available but cannot become verified by implication.
result = reconcileResumeSources({ resumes: [base('Buyer', { source: 'builder', reviewed: false })] });
assert.equal(result.packageReadiness, 'NEEDS_REVIEW');
assert.equal(result.confirmedFacts.length, 0);
assert.equal(result.legacyOnlyFacts.length, 1);

// A changed active Vault master is a document conflict; missing selection is explicit.
result = reconcileResumeSources({ resumes: [base('Buyer'), base('Senior Buyer', { id: 'vault:master', hash: B, selected: false, current: true, accountBacked: true })] });
assert.equal(result.conflicts[0].type, 'BASE_DOCUMENT_DIVERGENCE');
assert.equal(result.packageReadiness, 'NEEDS_REVIEW');
assert.equal(reconcileResumeSources({ resumes: [base('Buyer', { selected: false })] }).packageReadiness, 'NO_BASE_RESUME');
assert.equal(reconcileResumeSources({ resumes: [base('Buyer', { hash: '' })] }).packageReadiness, 'INCOMPLETE');
assert.equal(reconcileResumeSources({ resumes: [base('Buyer')], requiredSourcesAvailable: false }).packageReadiness, 'INCOMPLETE');
for (const fieldKey of ['employer', 'employmentDates', 'degree', 'school', 'certification', 'skill', 'metric', 'contact']) {
  const compared = reconcileResumeSources({ resumes: [base('Buyer', { facts: [{ fieldKey, value: 'A', source: 'browser' }] })],
    facts: [{ fieldKey, value: 'B', source: 'saved-info', verificationState: 'document-verified' }] });
  assert.equal(compared.conflicts[0].fieldKey, fieldKey);
}

assert.equal(firstJobTitleFact('EXPERIENCE\nAcme\nSenior Buyer | 2020-2025', 'browser').value, 'Senior Buyer');
assert.equal(firstJobTitleFact('Senior Buyer at Acme, 2020-2025', 'saved-info').value, 'Senior Buyer');
assert.equal(firstJobTitleFact('Unknown free text', 'browser'), null);

console.log('Resume reconciliation tests passed (8 required cases plus edge checks).');
