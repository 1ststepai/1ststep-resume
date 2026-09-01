export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.2.0';
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = 'b3d924a0b60e04785f234932f12dc2ced18780abac302960bc273a6f669ff9c7';

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
