export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.6.0';
// Re-pinned for v1.6.0. The user may explicitly capture structured, major ATS,
// selected, and accessible framed job content through activeTab + scripting.
// This adds no broad host permission; Greenhouse filling remains reviewed and no-submit.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '72491347f92a416d76d0e81f097aa0516d277587bfa304fadb20c22d42f44fff';

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
