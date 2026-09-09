export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.6.0';
// Re-pinned for v1.6.0. The user may explicitly capture structured, major ATS,
// selected, and accessible framed job content through activeTab + scripting.
// This adds no broad host permission; Greenhouse filling remains reviewed and no-submit.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '4b56b11e32c2f021dce5189a3a2d1a6ae2dd19250c835a523b8292d59ab1c325';

export function controlledExtensionReleaseConfiguration(env = process.env) {
  const configuredDigest = String(env.JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 || '').trim().toLowerCase();
  const ready = configuredDigest === CONTROLLED_GREENHOUSE_EXTENSION_SHA256;
  return {
    ready,
    version: CONTROLLED_GREENHOUSE_EXTENSION_VERSION,
    sha256: ready ? CONTROLLED_GREENHOUSE_EXTENSION_SHA256 : null,
    capability: 'universal-capture-supervised-greenhouse-no-submit',
    containsCandidateValues: false,
    includesLegacyModules: false,
  };
}
