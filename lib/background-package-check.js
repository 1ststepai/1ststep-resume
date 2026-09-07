import { readJobAgentRunForTenant } from './job-agent-run-store.js';
import { bindPackageToFreshVerifiedDiscovery } from './discovery-package-binding.js';

// A queued draft can wait hours. Verify its source again before paying for AI.
export async function checkBackgroundPackage({ claimed, redis, dataEncryptionKey, sources, now = new Date(), readRun = readJobAgentRunForTenant, bind = bindPackageToFreshVerifiedDiscovery }) {
  if (claimed.run.mission.revision) return; // Private edits do not call AI.
  const discovery = await readRun({ redis, dataEncryptionKey, tenantId: claimed.tenantId, runId: claimed.run.mission.discoveryRunId });
  if (!discovery) throw new Error('PACKAGE_DISCOVERY_UNAVAILABLE');
  await bind(discovery, claimed.run.mission, { sources, now });
}

export function backgroundPackageFailure(error) {
  const message = String(error?.message || '');
  if (/requisition is closed/i.test(message)) return { code: 'DIRECT_EMPLOYER_REQUISITION_CLOSED', retryable: false };
  if (/requisition changed|IDENTITY_CHANGED/i.test(message)) return { code: 'DIRECT_EMPLOYER_REQUISITION_CHANGED', retryable: false };
  if (/PACKAGE_DISCOVERY_UNAVAILABLE|no longer exactly matches|finished tenant-owned/i.test(message)) return { code: 'PACKAGE_DISCOVERY_UNAVAILABLE', retryable: false };
  return { code: 'DIRECT_EMPLOYER_REVERIFICATION_UNAVAILABLE', retryable: true };
}
