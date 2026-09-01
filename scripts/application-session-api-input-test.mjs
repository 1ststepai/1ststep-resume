import assert from 'node:assert/strict';
import { validateApplicationSessionMutationBody } from '../api/application-sessions.js';

const safe = {
  action: 'confirm-external-step', sessionId: 'application_fixture_001', actionId: 'action_fixture_001', confirmed: true, version: 3,
};
assert.equal(validateApplicationSessionMutationBody(safe), true);
assert.throws(() => validateApplicationSessionMutationBody({ ...safe, answer: 'candidate answer' }), /value-free action confirmation/);
assert.throws(() => validateApplicationSessionMutationBody({ ...safe, otp: '123456' }), /Credentials and challenge values/);
assert.throws(() => validateApplicationSessionMutationBody({ ...safe, password: 'not-allowed' }), /Credentials and challenge values/);

const reconciliation = {
  action: 'reconcile-employer-failure', sessionId: 'application_fixture_001', actionId: 'action_failure_001', confirmed: true, outcome: 'FIELDS_NOT_FILLED', version: 4,
};
assert.equal(validateApplicationSessionMutationBody(reconciliation), true);
assert.throws(() => validateApplicationSessionMutationBody({ ...reconciliation, fieldValue: 'private answer' }), /value-free review outcome/);

const finalReview = {
  action: 'request-final-review', sessionId: 'application_fixture_001', confirmed: true, version: 5,
};
assert.equal(validateApplicationSessionMutationBody(finalReview), true);
assert.throws(() => validateApplicationSessionMutationBody({ ...finalReview, fieldSchemaHash: 'a'.repeat(64) }), /value-free user confirmation/);
assert.throws(() => validateApplicationSessionMutationBody({ ...finalReview, reviewedFieldKeys: ['email'] }), /value-free user confirmation/);

const finalApprovalRenewal = {
  action: 'refresh-final-approval', sessionId: 'application_fixture_001', version: 6,
};
assert.equal(validateApplicationSessionMutationBody(finalApprovalRenewal), true);
assert.throws(() => validateApplicationSessionMutationBody({ ...finalApprovalRenewal, confirmed: true }), /saved session version/);
assert.throws(() => validateApplicationSessionMutationBody({ ...finalApprovalRenewal, scopeHash: 'a'.repeat(64) }), /saved session version/);

console.log('Application-session API value-input rejection tests passed.');
