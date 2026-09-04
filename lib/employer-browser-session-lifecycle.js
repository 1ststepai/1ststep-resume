import { closeEmployerBrowserHandoff } from './employer-browser-session-provider.js';
import {
  deleteEmployerBrowserSessionMetadataAfterProviderClose,
  listEmployerBrowserSessionsInternal,
  readEmployerBrowserSessionForApplication,
} from './employer-browser-session-store.js';

export const BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED = 'BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED';

function teardownError({ closed = 0, deleted = 0, retryRequired = 1 } = {}) {
  const error = new Error('Browser provider teardown must be retried before encrypted recovery metadata can be deleted.');
  error.code = BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED;
  error.closed = Math.max(0, Number(closed) || 0);
  error.deleted = Math.max(0, Number(deleted) || 0);
  error.retryRequired = Math.max(1, Number(retryRequired) || 1);
  return error;
}

async function providerClosed(browserSession, { env, closeProvider }) {
  const closure = await closeProvider({ browserSession, env });
  return ['closed', 'missing'].includes(closure?.status);
}

export async function closeEmployerBrowserSessionBeforeDelete({ config, subject, applicationSessionId, env = process.env, closeProvider = closeEmployerBrowserHandoff }) {
  const browserSession = await readEmployerBrowserSessionForApplication({
    ...config, subject, applicationSessionId, includeProviderReference: true,
  });
  if (!browserSession) return { closed: true, deleted: false };
  if (!await providerClosed(browserSession, { env, closeProvider })) throw teardownError();
  const deleted = await deleteEmployerBrowserSessionMetadataAfterProviderClose({ ...config, subject, applicationSessionId });
  return { closed: true, deleted };
}

export async function closeAllEmployerBrowserSessionsBeforeDelete({ config, subject, env = process.env, closeProvider = closeEmployerBrowserHandoff }) {
  const sessions = await listEmployerBrowserSessionsInternal({ ...config, subject });
  let closed = 0;
  let deleted = 0;
  let retryRequired = 0;
  for (const browserSession of sessions) {
    try {
      if (!await providerClosed(browserSession, { env, closeProvider })) { retryRequired += 1; continue; }
      closed += 1;
      deleted += Number(await deleteEmployerBrowserSessionMetadataAfterProviderClose({
        ...config, subject, applicationSessionId: browserSession.applicationSessionId,
      }));
    } catch {
      retryRequired += 1;
    }
  }
  if (retryRequired) throw teardownError({ closed, deleted, retryRequired });
  return { closed, deleted };
}
