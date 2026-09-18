import assert from 'node:assert/strict';
import { applicationControlCenterModel, applicationLedgerMarkdown, canonicalApplicationRecords, detectApplicationConflicts, hasAuthoritativeEmployerReceipt } from '../client/application-control-center.js';
import { verifiedRoleEvidence } from '../lib/discovery-package-binding.js';
import { confirmApplicationApproval, createApplicationSession, refreshApplicationTransmissionApproval } from '../lib/application-session-domain.js';

const listingEvidence = verifiedRoleEvidence({
  location: 'United States', remote: true, workplaceType: 'Remote', salaryMin: 80000, salaryMax: 120000, salaryCurrency: 'USD',
  salaryDisclosure: 'Base salary range: $80,000-$120,000', description: 'Occasional travel is required. This role has no direct reports.', applyPathVerifiedAt: '2026-09-07T10:00:00.000Z',
});
assert.equal(listingEvidence.compensationBasis, 'base');
assert.match(listingEvidence.travelDisclosure, /Occasional travel/i);
assert.equal(listingEvidence.peopleLeadershipRequired, false, 'negated leadership language is not treated as a requirement');
assert.equal(verifiedRoleEvidence({ description: 'You will manage a team of five buyers.' }).peopleLeadershipRequired, true);

const conflicts = detectApplicationConflicts({
  roleEvidence: { remote: true, compensationBasis: 'ote', peopleLeadershipRequired: true, categoryManagementRequired: true },
  formFields: [{ label: 'Can you work onsite three days each week?' }, { label: 'Are you willing to travel up to 25%?' }],
});
assert.deepEqual(conflicts.map(item => item.code), ['REMOTE_ONSITE_CONFLICT', 'COMPENSATION_NOT_BASE', 'UNEXPECTED_TRAVEL', 'LEADERSHIP_REQUIREMENT', 'CATEGORY_MANAGEMENT_EXCLUSION']);

const session = {
  id: 'application_12345678', packageRunId: 'package_12345678', documentVersion: 'package_v1', stage: 'transmission_approval',
  role: { employer: 'Example Co', title: 'Buyer', requisitionId: 'REQ-1', directEmployerUrl: 'https://example.com/jobs/1', evidence: { remote: true, location: 'United States', salaryMin: 80000, salaryMax: 100000, salaryCurrency: 'USD', compensationBasis: 'base' } },
  proposedFields: [{ label: 'Work authorization', maskedPreview: 'Y••', provenance: 'Candidate confirmation', confidence: 1 }],
  evidenceMapSummary: { mappedClaims: 7 }, updatedAt: '2026-09-07T12:00:00.000Z',
};
const model = applicationControlCenterModel(session);
assert.equal(model.facts.length, 3);
assert.equal(model.facts[1].label, 'Base salary');
assert.equal(model.mappedClaims, 7);
assert.equal(model.receiptVerified, false);
assert.equal(hasAuthoritativeEmployerReceipt({ receipt: { source: 'EMPLOYER_CONFIRMATION_PAGE', confirmationId: 'ABC-123' } }), true);
assert.equal(hasAuthoritativeEmployerReceipt({ receipt: { simulated: true, source: 'EMPLOYER_CONFIRMATION_PAGE', confirmationId: 'ABC-123' } }), false);

const laterReceipt = { ...session, id: 'application_87654321', receipt: { source: 'EMPLOYER_CONFIRMATION_EMAIL', confirmationId: 'ABC-123', receivedAt: '2026-09-07T13:00:00.000Z' }, updatedAt: '2026-09-07T13:00:00.000Z' };
const records = canonicalApplicationRecords({ sessions: [session, laterReceipt], roles: [{ ...session.role, status: 'Verified' }] });
assert.equal(records.length, 1);
assert.equal(records[0].status, 'Receipt Verified');
const report = applicationLedgerMarkdown({ sessions: [session, laterReceipt] }, new Date('2026-09-07T14:00:00.000Z'));
assert.match(report, /Receipt Verified/);
assert.doesNotMatch(report, /Y••|Work authorization/);
assert.equal((report.match(/\| Example Co \|/g) || []).length, 1);

const scoped = createApplicationSession({
  packageRunId: 'package_12345678', packageQaVerified: true, documentVersion: 'package_v1', employer: 'Example Co', title: 'Buyer', requisitionId: 'REQ-1',
  directEmployerUrl: 'https://example.com/jobs/1', roleEvidence: listingEvidence, evidenceMapSummary: { mappedClaims: 7 }, proposedFields: [],
}, new Date('2026-09-07T12:00:00.000Z'));
const approved = confirmApplicationApproval(scoped, { kind: 'transmission', confirmed: true }, new Date('2026-09-07T12:01:00.000Z'));
const changedAfterApproval = { ...approved, role: { ...approved.role, evidence: { ...approved.role.evidence, remote: false } } };
const reapproval = refreshApplicationTransmissionApproval(changedAfterApproval, new Date('2026-09-07T12:02:00.000Z'));
assert.equal(reapproval.stage, 'transmission_approval');
assert.equal(reapproval.actions[0].type, 'TRANSMISSION_APPROVAL');
console.log('application control center tests passed');
