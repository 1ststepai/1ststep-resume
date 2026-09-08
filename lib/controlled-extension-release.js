export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.4.0';
// Re-pinned for v1.4.0. The user may explicitly capture the visible job page
// through activeTab + scripting. A short-lived, identity-free session cache
// keeps signed-in Job Agent access visible after returning to the job board.
// This adds no broad host permission; Greenhouse filling remains reviewed and no-submit.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '03a5ea5c970ea56a320ff70f14a91671531eafdbe04e49a11823a1dac8b8b928';

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
