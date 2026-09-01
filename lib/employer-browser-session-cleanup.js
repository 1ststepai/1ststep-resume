import { closeEmployerBrowserHandoff } from './employer-browser-session-provider.js';
import {
  claimNextExpiredEmployerBrowserSession,
  deleteClaimedExpiredEmployerBrowserSession,
  releaseExpiredEmployerBrowserSessionCleanup,
} from './employer-browser-session-store.js';

export async function processNextExpiredEmployerBrowserSession({ redis, dataEncryptionKey, env = process.env, now = new Date(), dependencies = {} } = {}) {
  const claim = dependencies.claim || claimNextExpiredEmployerBrowserSession;
  const closeProvider = dependencies.closeProvider || closeEmployerBrowserHandoff;
  const remove = dependencies.remove || deleteClaimedExpiredEmployerBrowserSession;
  const release = dependencies.release || releaseExpiredEmployerBrowserSessionCleanup;
  const claimed = await claim({ redis, dataEncryptionKey, now });
  if (!claimed) return { status: 'idle', externalAction: false, containsCandidateValues: false };
  try {
    const closure = await closeProvider({ browserSession: claimed.browserSession, env });
    if (['closed', 'missing'].includes(closure?.status)) {
      const deleted = await remove({
        redis, id: claimed.id, tenantId: claimed.tenantId,
        applicationSessionId: claimed.browserSession.applicationSessionId, leaseToken: claimed.leaseToken,
      });
      if (deleted) return { status: 'cleaned', providerConfirmed: true, externalAction: closure.externalAction === true, containsCandidateValues: false };
    }
  } catch { /* encrypted recovery metadata remains queued */ }
  await release({ redis, id: claimed.id, leaseToken: claimed.leaseToken, cleanupAttempt: claimed.cleanupAttempt, now }).catch(() => false);
  return { status: 'retry', providerConfirmed: false, externalAction: false, containsCandidateValues: false };
}
