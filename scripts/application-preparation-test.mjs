import assert from 'node:assert/strict';
import { preparationCandidates, automaticPreparationAuthorized } from '../client/application-preparation.js';
import { createDeskState, addRole, recordGeneratedPackage, transitionRole } from '../client/concierge-domain.js';
const role = { id: 'role-1', discoveryRunId: 'run-current', status: 'Found', sourceType: 'direct-employer', applyPathActive: true, requisitionId: 'REQ-1', jobDescription: 'Published requirements. '.repeat(20), credibleInterviewPath: true, fitScore: 80 };
const select = roles => preparationCandidates(roles, { discoveryRunId: 'run-current', limit: 10 });
assert.equal(select([role]).length, 1);
for (const patch of [{ packageRunId: 'run-existing' }, { packageDraft: {} }, { discoveryRunId: 'old' }, { status: 'Submitted' }, { status: 'Rejected/Closed' }, { hardDisqualifiers: ['Not eligible'] }, { credibleInterviewPath: false }, { applyPathActive: false }]) {
  assert.equal(select([{ ...role, ...patch }]).length, 0);
}
assert.equal(automaticPreparationAuthorized({ status: 'active', active: true, scopes: ['ai-document-preparation'] }), true);
assert.equal(automaticPreparationAuthorized({ status: 'active', active: false, scopes: ['ai-document-preparation'] }), false);
assert.equal(automaticPreparationAuthorized({ status: 'revoked', active: true, scopes: ['ai-document-preparation'] }), false);
assert.equal(automaticPreparationAuthorized({ status: 'active', active: true, scopes: [] }), false);
const captured = addRole(createDeskState(), { employer: 'Synthetic Employer', title: 'Manager', requisitionId: 'REQ-1', directEmployerUrl: 'https://jobs.example.test/req-1' });
const drafted = recordGeneratedPackage(captured.state, captured.role.id, { historyId: 'run-private', documentVersion: 'draft-v1', resumeText: 'Synthetic private resume draft' });
assert.equal(drafted.roles[0].status, 'Found', 'Drafting cannot promote eligibility or submission status');
assert.throws(() => transitionRole(drafted, captured.role.id, 'Package Ready'), /Cannot move/);
assert.throws(() => transitionRole(drafted, captured.role.id, 'Submitted'));
console.log('Preparation uses authorized fresh matches, excludes existing/terminal work, and does not promote draft eligibility or submission.');
