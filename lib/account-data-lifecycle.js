export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE MY JOB AGENT CLOUD DATA';
export const FRESH_DELETE_SESSION_MS = 15 * 60 * 1000;
export const ACCOUNT_EXPORT_MAX_RECORDS_PER_COLLECTION = 10_000;

function accountExportError(message) {
  const error = new Error(message);
  error.code = 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE';
  return error;
}

export async function collectCompleteAccountCollection({ readPage, pageSize = 250, maximumRecords = ACCOUNT_EXPORT_MAX_RECORDS_PER_COLLECTION }) {
  if (typeof readPage !== 'function') throw accountExportError('An account export page reader is required.');
  const size = Number(pageSize);
  const maximum = Number(maximumRecords);
  if (!Number.isSafeInteger(size) || size < 1 || size > 500 || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > ACCOUNT_EXPORT_MAX_RECORDS_PER_COLLECTION) {
    throw accountExportError('Account export bounds are invalid.');
  }
  const items = [];
  const itemIds = new Set();
  let expectedTotal = null;
  let scanned = 0;
  let pages = 0;
  while (expectedTotal === null || scanned < expectedTotal) {
    const requestLimit = Math.min(size, Math.max(1, maximum - scanned));
    const page = await readPage({ offset: scanned, limit: requestLimit, withPageInfo: true });
    if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.scanned) || !Number.isSafeInteger(page.total)
      || page.scanned < 0 || page.scanned > requestLimit || page.items.length > page.scanned || page.offset !== scanned || page.limit !== requestLimit) {
      throw accountExportError('Account export page metadata is invalid.');
    }
    if (expectedTotal === null) {
      expectedTotal = page.total;
      if (expectedTotal > maximum) throw accountExportError('Account export collection exceeds the synchronous completeness limit.');
    } else if (page.total !== expectedTotal) {
      throw accountExportError('Account export collection changed while the snapshot was being built.');
    }
    if (page.scanned === 0 && scanned < expectedTotal) throw accountExportError('Account export index ended before its declared cardinality.');
    for (const item of page.items) {
      const id = String(item?.id || '');
      if (!id || itemIds.has(id)) throw accountExportError('Account export contains a missing or duplicate record identity.');
      itemIds.add(id);
      items.push(item);
    }
    scanned += page.scanned;
    pages += 1;
    if (pages > Math.ceil(maximum / size) + 1 || scanned > maximum) throw accountExportError('Account export collection exceeded its safe page bound.');
  }
  if (scanned !== expectedTotal) throw accountExportError('Account export collection did not reach a stable boundary.');
  return { items, complete: true, indexRecordsScanned: scanned, recordsExported: items.length, staleIndexEntries: scanned - items.length, pages };
}

function residualIdempotencyPatterns(tenantId) {
  return [
    `1ststep:vault:v1:${tenantId}:idem:*`,
    `1ststep:consent:v1:${tenantId}:idem:*`,
    `1ststep:beta:v1:${tenantId}:campaign:idem:*`,
    `1ststep:job-agent-schedule:v1:tenant:${tenantId}:idem:*`,
    `1ststep:job-agent:v1:tenant:${tenantId}:idem:*`,
    `1ststep:application-session:v1:tenant:${tenantId}:idem:*`,
  ];
}

export async function deleteTenantResidualIdempotencyKeys({ redis, tenantId, maximumKeys = 10_000 }) {
  if (!redis || typeof redis.scan !== 'function' || !/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A tenant-bound Redis scan is required.');
  const limit = Math.max(1, Math.min(10_000, Number(maximumKeys) || 10_000));
  const keys = new Set();
  for (const pattern of residualIdempotencyPatterns(tenantId)) {
    const prefix = pattern.slice(0, -1);
    let cursor = '0';
    const seenCursors = new Set();
    do {
      if (seenCursors.has(cursor) || seenCursors.size >= 1_000) throw new Error('Tenant residual-key scan did not converge.');
      seenCursors.add(cursor);
      const response = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = String(response?.[0] ?? '0');
      for (const key of response?.[1] || []) {
        if (!String(key).startsWith(prefix)) throw new Error('Tenant residual-key scan escaped its partition.');
        keys.add(String(key));
        if (keys.size > limit) throw new Error('Tenant residual-key deletion limit exceeded.');
      }
    } while (cursor !== '0');
  }
  const bounded = [...keys];
  for (let offset = 0; offset < bounded.length; offset += 100) await redis.del(...bounded.slice(offset, offset + 100));
  return { deleted: bounded.length, patternsExamined: residualIdempotencyPatterns(tenantId).length, contentFree: true, containsCandidateValues: false };
}

function artifactManifest(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : []).map(({ contentBase64: _contentBase64, objectRef: _objectRef, inspection: _inspection, ...metadata }) => ({
    ...metadata,
    binaryIncluded: false,
  }));
}

function exportRun(run) {
  if (!run) return run;
  const result = run.result && typeof run.result === 'object'
    ? { ...run.result, artifacts: artifactManifest(run.result.artifacts) }
    : run.result;
  return { ...run, result };
}

export function assertFreshOpaqueSession(auth, now = new Date()) {
  if (auth?.authentication !== 'opaque-session') throw new Error('RECENT_SIGN_IN_REQUIRED');
  const createdAt = new Date(auth.createdAt).getTime();
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > FRESH_DELETE_SESSION_MS || createdAt > now.getTime() + 60_000) {
    throw new Error('RECENT_SIGN_IN_REQUIRED');
  }
  return true;
}

export function buildAccountDataExport({ subject, consent, schedule, notifications, emailSuppression = null, vault, campaign, runs = [], applicationSessions = [], employerBrowserTasks = [], applicationSubmissionTasks = [], applicationReceiptTasks = [], employerBrowserSessions = [], collectionCompleteness = null, now = new Date() }) {
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    account: { subject },
    scope: {
      applicantVault: true,
      jobAgentConsent: true,
      jobAgentSchedule: true,
      needsYouNotificationPreference: true,
      needsYouEmailSuppression: true,
      campaignState: true,
      jobAgentRuns: true,
      applicationSessions: true,
      employerBrowserTaskMetadata: true,
      applicationSubmissionTaskMetadata: true,
      applicationReceiptTaskMetadata: true,
      employerBrowserSessionMetadata: true,
      operationalCollectionsComplete: collectionCompleteness?.complete === true,
      collectionCompleteness,
      artifactBinariesIncluded: false,
      billingAndSubscriptionRecordsIncluded: false,
      retentionLockedAuditRecordsIncluded: false,
      artifactBinaryNote: 'Generated document binaries are omitted from this JSON export. Their filenames, hashes, byte counts, and version metadata are included and authenticated downloads remain available until deletion.',
      accountRecordNote: 'Billing, subscription, fraud-prevention, legally required transaction records, and any content-free retention-locked audit heads are outside this Job Agent operational-data export and follow their separately disclosed retention or legal-hold process.',
    },
    applicantVault: vault,
    jobAgentConsent: consent,
    jobAgentSchedule: schedule,
    needsYouNotificationPreference: notifications,
    needsYouEmailSuppression: emailSuppression,
    campaignState: campaign,
    jobAgentRuns: runs.map(exportRun),
    applicationSessions,
    employerBrowserTasks,
    applicationSubmissionTasks,
    applicationReceiptTasks,
    employerBrowserSessions,
  };
}
