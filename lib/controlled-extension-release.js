export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.3.0';
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '9645792e0c38df1846c216f0793ff1c179e67fa56be7821c8bfbeb6517ca3305';

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
