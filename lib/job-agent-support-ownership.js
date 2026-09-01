const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;

// This is the SHA-256 of docs/JOB_AGENT_BETA_RUNBOOK.md in the reviewed build.
// The source-level test fails whenever that runbook changes without an explicit
// fingerprint update, and production must opt in with the same digest.
export const JOB_AGENT_INCIDENT_RUNBOOK_SHA256 = 'b0b1b281e2aa2c5d86e01969802a9f5e15a10c06f2946d6cd147028e605e115b';

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function version(value) {
  const normalized = String(value || '').trim();
  return VERSION.test(normalized) ? normalized : null;
}

function ownerAssigned(value) {
  return EMAIL.test(String(value || '').trim());
}

export function jobAgentSupportOwnershipConfiguration(env = process.env) {
  const approvalRecorded = enabled(env.JOB_AGENT_SUPPORT_INCIDENT_APPROVED);
  const contractVersion = version(env.JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION);
  const supportOwnerAssigned = ownerAssigned(env.JOB_AGENT_SUPPORT_OWNER);
  const incidentOwnerAssigned = ownerAssigned(env.JOB_AGENT_INCIDENT_OWNER);
  const coveragePolicyVersion = version(env.JOB_AGENT_SUPPORT_COVERAGE_VERSION);
  const escalationPolicyVersion = version(env.JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION);
  const runbookVersion = version(env.JOB_AGENT_INCIDENT_RUNBOOK_VERSION);
  const configuredDigest = String(env.JOB_AGENT_INCIDENT_RUNBOOK_SHA256 || '').trim().toLowerCase();
  const runbookFingerprintMatches = SHA256.test(configuredDigest)
    && configuredDigest === JOB_AGENT_INCIDENT_RUNBOOK_SHA256;
  const ready = approvalRecorded
    && Boolean(contractVersion)
    && supportOwnerAssigned
    && incidentOwnerAssigned
    && Boolean(coveragePolicyVersion)
    && Boolean(escalationPolicyVersion)
    && Boolean(runbookVersion)
    && runbookFingerprintMatches;

  return {
    ready,
    approvalRecorded,
    contractVersion,
    supportOwnerAssigned,
    incidentOwnerAssigned,
    coveragePolicyVersion,
    escalationPolicyVersion,
    runbookVersion,
    runbookFingerprintMatches,
  };
}

export function publicJobAgentSupportOwnershipConfiguration(configuration = {}) {
  return {
    ready: configuration.ready === true,
    approvalRecorded: configuration.approvalRecorded === true,
    contractVersion: configuration.contractVersion || null,
    supportOwnerAssigned: configuration.supportOwnerAssigned === true,
    incidentOwnerAssigned: configuration.incidentOwnerAssigned === true,
    coveragePolicyVersion: configuration.coveragePolicyVersion || null,
    escalationPolicyVersion: configuration.escalationPolicyVersion || null,
    runbookVersion: configuration.runbookVersion || null,
    runbookFingerprintMatches: configuration.runbookFingerprintMatches === true,
    containsOwnerIdentifiers: false,
  };
}
