import assert from 'node:assert/strict';
import { JOB_AGENT_OPERATOR_BRIDGE_HEADER, isJobAgentOperatorBridgeAuthorized } from '../lib/job-agent-operator-bridge.js';

const secret = '0123456789abcdef0123456789abcdef';
const request = value => ({ headers: { [JOB_AGENT_OPERATOR_BRIDGE_HEADER]: value } });

assert.equal(isJobAgentOperatorBridgeAuthorized(request(secret), { JOB_AGENT_OPERATOR_BRIDGE_SECRET: secret }), true);
assert.equal(isJobAgentOperatorBridgeAuthorized(request(`${secret}x`), { JOB_AGENT_OPERATOR_BRIDGE_SECRET: secret }), false);
assert.equal(isJobAgentOperatorBridgeAuthorized(request(secret), { JOB_AGENT_OPERATOR_BRIDGE_SECRET: 'too-short' }), false);
assert.equal(isJobAgentOperatorBridgeAuthorized({ headers: {} }, { JOB_AGENT_OPERATOR_BRIDGE_SECRET: secret }), false);

console.log('Job Agent operator bridge authentication tests passed.');
