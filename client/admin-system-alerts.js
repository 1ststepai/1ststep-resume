export function buildAdminSystemAlertDashboard(operations = {}) {
  const queue = operations?.queueHealth?.operatorAlert;
  const delivery = operations?.launchManifest?.operatorAlerting;
  const discord = operations?.launchManifest?.discordOperatorAlerts;
  if (!queue && !delivery && !discord) return { available: false, reason: 'System alert evidence is unavailable.' };
  return {
    available: true,
    destination: discord?.ready === true ? 'Private Discord channel' : 'Not connected',
    discordReady: discord?.ready === true,
    outboxReady: delivery?.ready === true,
    queueStatus: queue?.status || 'unknown',
    pending: Number.isSafeInteger(Number(queue?.pending)) ? Number(queue.pending) : null,
    overdue: Number.isSafeInteger(Number(queue?.overdue)) ? Number(queue.overdue) : null,
    failed: Number.isSafeInteger(Number(queue?.failed)) ? Number(queue.failed) : null,
    acknowledgementMinutes: Number.isSafeInteger(Number(delivery?.acknowledgementWindowMinutes)) ? Number(delivery.acknowledgementWindowMinutes) : null,
    wholeAppOutageCoverage: 'External uptime monitor required',
    contentFree: true,
  };
}
