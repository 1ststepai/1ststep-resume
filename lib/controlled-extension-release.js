export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.5.0';
// Re-pinned for v1.5.0. The user may explicitly capture structured, major ATS,
// selected, and accessible framed job content through activeTab + scripting.
// This adds no broad host permission; Greenhouse filling remains reviewed and no-submit.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '52de8caed82dbe7c997a4b5cd5f3782acb1d95ff69739b23cec91edcdc0199df';

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
