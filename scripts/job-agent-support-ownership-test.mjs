import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  JOB_AGENT_INCIDENT_RUNBOOK_SHA256,
  jobAgentSupportOwnershipConfiguration,
  publicJobAgentSupportOwnershipConfiguration,
} from '../lib/job-agent-support-ownership.js';

const runbook = await readFile(new URL('../docs/JOB_AGENT_BETA_RUNBOOK.md', import.meta.url));
assert.equal(createHash('sha256').update(runbook).digest('hex'), JOB_AGENT_INCIDENT_RUNBOOK_SHA256, 'runbook edits require an intentional reviewed fingerprint update');

const readyEnv = {
  JOB_AGENT_SUPPORT_INCIDENT_APPROVED: 'true',
  JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION: 'support-incident-v1',
  JOB_AGENT_SUPPORT_OWNER: 'support-owner@example.test',
  JOB_AGENT_INCIDENT_OWNER: 'incident-owner@example.test',
  JOB_AGENT_SUPPORT_COVERAGE_VERSION: 'coverage-v1',
  JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION: 'escalation-v1',
  JOB_AGENT_INCIDENT_RUNBOOK_VERSION: 'runbook-v1',
  JOB_AGENT_INCIDENT_RUNBOOK_SHA256,
};

assert.equal(jobAgentSupportOwnershipConfiguration({}).ready, false);
let configuration = jobAgentSupportOwnershipConfiguration(readyEnv);
assert.equal(configuration.ready, true);
assert.equal(configuration.supportOwnerAssigned, true);
assert.equal(configuration.incidentOwnerAssigned, true);
assert.equal(configuration.runbookFingerprintMatches, true);

const publicConfiguration = publicJobAgentSupportOwnershipConfiguration(configuration);
assert.equal(publicConfiguration.ready, true);
assert.equal(publicConfiguration.containsOwnerIdentifiers, false);
const serialized = JSON.stringify(publicConfiguration);
assert.equal(serialized.includes(readyEnv.JOB_AGENT_SUPPORT_OWNER), false);
assert.equal(serialized.includes(readyEnv.JOB_AGENT_INCIDENT_OWNER), false);
assert.equal(serialized.includes(JOB_AGENT_INCIDENT_RUNBOOK_SHA256), false);

for (const key of [
  'JOB_AGENT_SUPPORT_INCIDENT_APPROVED',
  'JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION',
  'JOB_AGENT_SUPPORT_OWNER',
  'JOB_AGENT_INCIDENT_OWNER',
  'JOB_AGENT_SUPPORT_COVERAGE_VERSION',
  'JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION',
  'JOB_AGENT_INCIDENT_RUNBOOK_VERSION',
  'JOB_AGENT_INCIDENT_RUNBOOK_SHA256',
]) {
  configuration = jobAgentSupportOwnershipConfiguration({ ...readyEnv, [key]: '' });
  assert.equal(configuration.ready, false, `${key} must fail closed`);
}

configuration = jobAgentSupportOwnershipConfiguration({ ...readyEnv, JOB_AGENT_INCIDENT_RUNBOOK_SHA256: 'f'.repeat(64) });
assert.equal(configuration.ready, false);
assert.equal(configuration.runbookFingerprintMatches, false);

console.log('Support and incident ownership contract tests passed.');
