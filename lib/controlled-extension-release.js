export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.4.0';
// Re-pinned for v1.4.0 after adding user-invoked job capture, durable My Jobs
// persistence acknowledgement, and a useful side panel. Persistent host access
// remains narrow; activeTab access runs only after the user invokes the extension.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '52e2666bf3c5cca373189cf6ca9bea1fcbc7ec8b62f0b363fc48dbed334b4a7d';

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
