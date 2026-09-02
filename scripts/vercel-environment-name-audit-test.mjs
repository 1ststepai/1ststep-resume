import assert from 'node:assert/strict';
import { auditVercelEnvironmentNames } from '../lib/vercel-environment-name-audit.js';

const payload = {
  envs: [
    { key: 'UPSTASH_REDIS_REST_URL', type: 'encrypted', target: ['production'], configurationId: 'cfg_1', createdAt: 1, updatedAt: 2 },
    { key: 'UPSTASH_REDIS_REST_TOKEN', type: 'sensitive', target: ['production'], configurationId: 'cfg_2', createdAt: 1, updatedAt: 2 },
    { key: 'RATE_LIMIT_HASH_SECRET', type: 'sensitive', target: ['production'], configurationId: 'cfg_3', createdAt: 1, updatedAt: 2 },
    { key: 'PREVIEW_ONLY_KEY', type: 'encrypted', target: ['preview'], configurationId: 'cfg_4', createdAt: 1, updatedAt: 2 },
  ],
};

const result = auditVercelEnvironmentNames(payload, { environment: 'production' });
assert.equal(result.contentFree, true);
assert.equal(result.containsSecretValues, false);
assert.equal(result.performsWrites, false);
assert.equal(result.configurationValuesValidated, false);
assert.equal(result.deployedRuntimeVerified, false);
assert.equal(result.observedVariableNameCount, 3);
assert.equal(result.observedVariableNameDigest.length, 64);
const durable = result.controls.find(control => control.id === 'durable-runtime');
assert.equal(durable.presentRequirementCount, 3);
assert.equal(durable.allNamesPresent, false);
assert.ok(durable.missingVariableNames.includes('JOB_AGENT_AUDIT_SECRET'));
const serialized = JSON.stringify(result);
assert.equal(serialized.includes('cfg_1'), false);
assert.equal(serialized.includes('sensitive'), false);

assert.throws(() => auditVercelEnvironmentNames({ envs: [{ ...payload.envs[0], value: 'must-not-be-read' }] }), /unsupported field/i);
assert.throws(() => auditVercelEnvironmentNames({ envs: [{ key: 'bad key', target: ['production'] }] }), /key is invalid/i);
assert.throws(() => auditVercelEnvironmentNames({ envs: [] }, { environment: 'staging' }), /Unsupported/);

console.log('Value-blind Vercel environment-name audit tests passed.');
