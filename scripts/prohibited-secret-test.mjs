import assert from 'node:assert/strict';
import {
  PROHIBITED_CREDENTIAL_KEY, assertNoProhibitedSecretText, containsProhibitedSecretText, redactProhibitedSecretText,
} from '../lib/prohibited-secret.js';

for (const value of [
  'password=hunter2', 'my password is hunter2', 'OTP was 123456', 'captcha answer is traffic-lights',
  'verification code: 678901', 'access token is abc.def.ghi', 'refresh_token=refresh-value', 'session cookie is session-value', 'cookie is private-value',
]) assert.equal(containsProhibitedSecretText(value), true, value);

for (const value of [
  'Passwords, OTPs, and CAPTCHA answers are never stored.', 'The secret sauce is paprika.',
  'The employer requires a password manager.', 'Verification code handling stays on the employer page.',
]) assert.equal(containsProhibitedSecretText(value), false, value);

assert.equal(PROHIBITED_CREDENTIAL_KEY.test('refreshToken'), true);
assert.equal(PROHIBITED_CREDENTIAL_KEY.test('cookie'), true);
assert.equal(PROHIBITED_CREDENTIAL_KEY.test('documentVersion'), false);
assert.throws(() => assertNoProhibitedSecretText('my passcode is 2468'), /not allowed/);
assert.equal(redactProhibitedSecretText('failure: OTP is 123456 and should not appear'), 'failure: [secret omitted]');

console.log('Shared natural-language credential and challenge-secret tests passed.');
