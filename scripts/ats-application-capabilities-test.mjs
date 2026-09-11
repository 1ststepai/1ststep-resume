import assert from 'node:assert/strict';
import { ATS_APPLICATION_CAPABILITIES, atsApplicationCapability } from '../lib/ats-application-capabilities.js';

assert.deepEqual(Object.keys(ATS_APPLICATION_CAPABILITIES), ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'workday']);
assert.equal(atsApplicationCapability('Greenhouse').discovery, 'supported');
assert.equal(atsApplicationCapability('greenhouse').assistedFill, 'controlled-extension-candidate');
assert.equal(atsApplicationCapability('lever').assistedFill, 'unavailable');
assert.equal(atsApplicationCapability('ashby').submission, 'disabled');
assert.equal(atsApplicationCapability('smartrecruiters').receiptEvidence, 'not-configured');
assert.equal(atsApplicationCapability('workable').discovery, 'unavailable');
assert.equal(atsApplicationCapability('workday').assistedFill, 'human-assisted');
assert.equal(Object.values(ATS_APPLICATION_CAPABILITIES).every(item => item.live === false), true);
assert.equal(Object.values(ATS_APPLICATION_CAPABILITIES).every(item => item.submission === 'disabled'), true);
assert.equal(atsApplicationCapability('unknown'), null);
assert.throws(() => { ATS_APPLICATION_CAPABILITIES.greenhouse.live = true; }, TypeError);

console.log('Conservative ATS capability matrix tests passed without claiming unverified live integrations.');

