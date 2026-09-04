import assert from 'node:assert/strict';
import { runRollbackPreflight, validateRollbackTarget } from './vercel-rollback-preflight.mjs';

const deploymentId = 'dpl_12345678901234567890';
const expectedProject = '1ststep-resume';
const productionHost = 'app.1ststep.ai';
const base = {
  id: deploymentId,
  name: expectedProject,
  target: 'production',
  readyState: 'READY',
  aliases: [productionHost],
};
const options = { deploymentId, expectedProject, productionHost };

assert.deepEqual(validateRollbackTarget(base, options), {
  ok: true,
  deploymentId,
  project: expectedProject,
  target: 'production',
  readyState: 'READY',
  productionHost,
  ownsProductionAlias: true,
  mode: 'pre-rollback-target-verification',
});

assert.equal(
  runRollbackPreflight({ ...options, requireAlias: false }, (reference) => {
    assert.equal(reference, deploymentId);
    return { ...base, aliases: [] };
  }).ownsProductionAlias,
  false,
);

assert.equal(
  runRollbackPreflight({ ...options, requireAlias: true }, (reference) => {
    assert.equal(reference, productionHost);
    return base;
  }).mode,
  'post-rollback-alias-verification',
);

for (const [label, candidate, overrides, pattern] of [
  ['wrong id', { ...base, id: 'dpl_00000000000000000000' }, {}, /does not match/i],
  ['wrong project', { ...base, name: 'other-project' }, {}, /unexpected/i],
  ['preview target', { ...base, target: null }, {}, /not a Production/i],
  ['not ready', { ...base, readyState: 'ERROR' }, {}, /not READY/i],
  ['missing alias after rollback', { ...base, aliases: [] }, { requireAlias: true }, /does not resolve/i],
  ['wrong host', base, { productionHost: 'evil.example' }, /exactly app\.1ststep\.ai/i],
]) {
  assert.throws(() => validateRollbackTarget(candidate, { ...options, ...overrides }), pattern, label);
}

assert.throws(
  () => validateRollbackTarget(base, { ...options, deploymentId: 'app.1ststep.ai' }),
  /valid exact Vercel deployment ID/i,
);

console.log('Rollback preflight verified exact-target, Production, Ready, project, host, and post-rollback alias controls.');
