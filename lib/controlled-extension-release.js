export const CONTROLLED_GREENHOUSE_EXTENSION_VERSION = '1.3.0';
// Re-pinned 2026-09-04 (third time this day). Source deltas: the job
// capture destination in background.js moved from /app to /app/resume, and
// auth-bridge.js gained the acknowledged-delivery handoff (exact capture id, no
// wildcard fallback, delete only after the page confirms it saved the job), and
// background.js became the sole writer of pendingJobs behind one serialized
// mutation queue so additions, expiry and acknowledged deletions cannot race.
// The release builder now canonicalizes text line endings so Windows and Linux
// produce the same reviewed archive. No manifest, permission, or capability change.
// The deployed JOB_AGENT_GREENHOUSE_EXTENSION_SHA256 must be updated to match
// before controlledExtensionReleaseConfiguration() reports ready again.
export const CONTROLLED_GREENHOUSE_EXTENSION_SHA256 = '66b1e84608ed274dd79cd83c4a83dc93a675495f9e4c018ac1b1dcce1a6cdd3e';

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
