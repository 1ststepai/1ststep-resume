export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.3.1';
// Re-pinned 2026-09-04 for v1.3.1. The Greenhouse handoff now requires a
// server-grounded match-confidence assessment and an explicit second click
// before transient approved values can touch employer fields. The popup renders
// the bounded tailoring justification. No host permission or submit capability changed.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '5b58a69b608c13cef820d8d945cc9d0d60b3a47490f612f087bc1cd41eec6ad7';

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
