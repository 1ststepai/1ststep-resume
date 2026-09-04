import { enqueueNeedsYouNotification, newestUnnotifiedNeedsYouAction } from './job-agent-notification-store.js';
import { recordConfiguredJobAgentOperationalEvent } from './job-agent-operational-metrics.js';

export async function notifyNewApplicationNeedsYouAction({
  config, subject, session, previousSession = null, env = process.env,
  enqueue = enqueueNeedsYouNotification, recordEvent = recordConfiguredJobAgentOperationalEvent,
} = {}) {
  const action = newestUnnotifiedNeedsYouAction(session, previousSession);
  if (!action) return { status: 'not-needed', actionId: null };
  try {
    const notification = await enqueue({ ...config, subject, actionId: action.id, env });
    if (notification.status === 'queued') await recordEvent('needs_you_notification_queued');
    return { ...notification, actionId: action.id };
  } catch {
    await recordEvent('needs_you_notification_failure').catch(() => {});
    return { status: 'failed', actionId: action.id };
  }
}
