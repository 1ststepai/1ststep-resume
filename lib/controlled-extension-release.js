export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.3.2';
// Re-pinned 2026-09-04 for v1.3.2. The Greenhouse handoff now requires a
// server-grounded match-confidence assessment and an explicit second click
// before transient approved values can touch employer fields. The popup renders
// the bounded tailoring justification. No host permission or submit capability changed.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '1b6d3bf4d2a38d427cff8f00184ec2437d4715063f5d740d86c6ee857fc3f604';

export function controlledExtensionReleaseConfiguration(env = process.env) {
  const configuredDigest = String(env.JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 || '').trim().toLowerCase();
  const ready = configuredDigest === CONTROLLED_GREENHOUSE_EXTENSION_SHA256;
  return {
    ready,
    version: CONTROLLED_GREENHOUSE_EXTENSION_VERSION,
    sha256: ready ? CONTROLLED_GREENHOUSE_EXTENSION_SHA256 : null,
    capability: 'supervised-greenhouse-no-submit',
    containsCandidateValues: false,
    includesLegacyModules: false,
  };
}
