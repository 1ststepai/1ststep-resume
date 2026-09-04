import assert from 'node:assert/strict';
import {
  buildAutofillUserMessage,
  sanitizeAutofillResponse,
  validateAutofillContext,
} from '../lib/autofill-policy.js';

const context = validateAutofillContext({
  profile: {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan@example.test',
    state: 'New Jersey',
    veteranStatus: 'Prefer not to answer',
    disability: 'No',
    citizenship: 'US',
    nested: { city: 'Newark', securityClearance: 'Secret' },
  },
  resume: 'Jordan Lee\nProcurement Manager, Acme Corporation\nNewark, New Jersey',
  fields: [
    { key: 'first_name', type: 'text', label: 'First name', required: true },
    { key: 'email', type: 'email', label: 'Email' },
    { key: 'employer', type: 'text', label: 'Current employer' },
    { key: 'state', type: 'select-one', label: 'State', options: ['New Jersey', 'New York'] },
    { key: 'veteran', type: 'select-one', label: 'Veteran status', options: ['Yes', 'No'] },
    { key: 'disability', type: 'text', label: 'Disability' },
    { key: 'password', type: 'password', label: 'Password' },
    { key: 'captcha', type: 'text', label: 'CAPTCHA answer' },
    { key: 'clearance', type: 'text', label: 'Security clearance' },
    { key: 'citizenship', type: 'text', label: 'Citizenship' },
    { key: 'salary', type: 'number', label: 'Desired salary' },
    { key: 'conflict', type: 'text', label: 'Outside employment conflict' },
  ],
});

assert.deepEqual(context.fields.map(field => field.key), ['first_name', 'email', 'employer', 'state']);
assert.equal(context.profile.veteranStatus, undefined);
assert.equal(context.profile.disability, undefined);
assert.equal(context.profile.citizenship, undefined);
assert.equal(context.profile.nested.securityClearance, undefined);
assert.equal(context.profile.nested.city, 'Newark');

const prompt = buildAutofillUserMessage(context);
assert.match(prompt, /ordinary_form_field_schema/);
assert.match(prompt, /first_name/);
assert.doesNotMatch(prompt, /veteranStatus|securityClearance|CAPTCHA answer|Desired salary/);

const result = sanitizeAutofillResponse(JSON.stringify({
  first_name: 'Jordan',
  email: 'jordan@example.test',
  employer: 'Acme Corporation',
  state: 'New Jersey',
  phone: '555-0100',
  veteran: 'No',
  clearance: 'Secret',
}), context);
assert.deepEqual({ ...result.map }, {
  first_name: 'Jordan',
  email: 'jordan@example.test',
  employer: 'Acme Corporation',
  state: 'New Jersey',
});
assert.deepEqual(new Set(result.omittedKeys), new Set(['phone', 'veteran', 'clearance']));

const invalidOption = sanitizeAutofillResponse('{"state":"NJ"}', context);
assert.deepEqual({ ...invalidOption.map }, {});
assert.deepEqual(invalidOption.omittedKeys, ['state']);

const prototypeAttempt = sanitizeAutofillResponse('{"__proto__":"Jordan","constructor":"Jordan","first_name":"Jordan"}', context);
assert.deepEqual({ ...prototypeAttempt.map }, { first_name: 'Jordan' });

assert.throws(() => sanitizeAutofillResponse('Here is the map: {"first_name":"Jordan"}', context));
assert.throws(() => sanitizeAutofillResponse('["Jordan"]', context));
assert.throws(() => validateAutofillContext({ profile: {}, fields: [{ key: 'name', value: 'Jordan' }] }), /AUTOFILL_FIELD_VALUES_FORBIDDEN/);
assert.throws(() => validateAutofillContext({ profile: {}, fields: Array.from({ length: 81 }, (_, index) => ({ key: `field_${index}` })) }), /AUTOFILL_CONTEXT_INVALID/);
assert.throws(() => validateAutofillContext({ profile: {}, fields: [{ key: 'password', type: 'password' }] }), /AUTOFILL_NO_SAFE_FIELDS/);

console.log('Autofill policy tests passed.');
