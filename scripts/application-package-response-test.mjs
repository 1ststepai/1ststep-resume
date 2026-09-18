import assert from 'node:assert/strict';
import { parsePackageJson, applicationPackageRequestFormat, assertPackageResponseComplete } from '../lib/application-package-worker.js';
import { preparationFailureCode, preparationRetryAllowed } from '../client/application-preparation.js';
import { reviewablePackageBase } from '../lib/application-package-revision.js';

assert.equal(parsePackageJson(JSON.stringify({ resume_text: 'Synthetic resume', cover_letter_text: '', source_map: [] })).resumeText, 'Synthetic resume');
assert.throws(() => parsePackageJson('{"resume_text":"private content'), /^Error: PACKAGE_RESPONSE_INVALID$/);
assert.throws(() => parsePackageJson(''), /PACKAGE_RESPONSE_EMPTY/);
assert.throws(() => parsePackageJson('{"resume_text":123}'), /PACKAGE_SCHEMA/);
for (const payload of [{ status: 'incomplete' }, { stop_reason: 'max_tokens' }, { choices: [{ finish_reason: 'length' }] }]) {
  assert.throws(() => assertPackageResponseComplete('test', payload), /PACKAGE_RESPONSE_TRUNCATED/);
}
assert.throws(() => assertPackageResponseComplete('test', { output: [{ content: [{ type: 'refusal' }] }] }), /PACKAGE_RESPONSE_REFUSED/);
assert.doesNotThrow(() => assertPackageResponseComplete('test', { status: 'completed' }));
const request = { provider: 'openai-compatible', url: 'https://api.openai.com/v1/responses', body: { max_output_tokens: 3000, store: false, reasoning: { effort: 'low' } } };
const formatted = applicationPackageRequestFormat(request);
assert.equal(formatted.body.text.format.strict, true);
assert.equal(formatted.body.max_output_tokens, 3000);
assert.equal(formatted.body.store, false);
assert.equal(formatted.body.reasoning.effort, 'none');
assert.equal(request.body.reasoning.effort, 'low');
const custom = { ...request, url: 'https://example.test/chat/completions' };
assert.equal(applicationPackageRequestFormat(custom), custom);
assert.equal(preparationFailureCode({ lastErrorCode: 'Unterminated string in JSON at position 123' }), 'PACKAGE_RESPONSE_TRUNCATED');
assert.equal(preparationFailureCode({ lastErrorCode: 'Unknown private diagnostic' }), 'PACKAGE_GENERATION_FAILED');
assert.equal(preparationRetryAllowed({ status: 'Failed', lastErrorCode: 'PACKAGE_RESPONSE_INVALID' }), true);
assert.equal(preparationRetryAllowed({ status: 'Failed', lastErrorCode: 'AI_PROVIDER_CONFIGURATION' }), false);
assert.equal(preparationRetryAllowed({ status: 'Finished', lastErrorCode: 'PACKAGE_RESPONSE_INVALID' }), false);
const reviewBase = { taskType: 'application_package', status: 'Waiting for You', result: { documentVersion: 'v1', resumeText: 'Private draft', sourceMap: [] } };
assert.equal(reviewablePackageBase(reviewBase), true);
assert.equal(reviewablePackageBase({ ...reviewBase, status: 'Finished' }), true);
for (const status of ['Failed', 'Searching', 'Preparing', 'Paused']) assert.equal(reviewablePackageBase({ ...reviewBase, status }), false);
assert.equal(reviewablePackageBase({ ...reviewBase, taskType: 'direct_employer_discovery' }), false);
assert.equal(reviewablePackageBase({ ...reviewBase, result: null }), false);
console.log('Package responses reject incomplete/refused/invalid output, constrain the schema without raising token spend, and allow only explicit recoverable retries.');
