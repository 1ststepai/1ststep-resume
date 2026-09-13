const COUNTS = [
  ['scanned', 'employer-feed listing scanned', 'employer-feed listings scanned'],
  ['duplicatesRemoved', 'duplicate listing removed', 'duplicate listings removed'],
  ['rejectedByMission', 'listing outside your search requirements', 'listings outside your search requirements'],
  ['limitedOut', 'listing not checked because of the search limit', 'listings not checked because of the search limit'],
  ['verificationFailed', 'requisition check that did not finish', 'requisition checks that did not finish'],
  ['rejectedAfterVerification', 'listing rejected after requisition verification', 'listings rejected after requisition verification'],
];

export function discoveryScreeningSummary(summary) {
  if (!summary || typeof summary !== 'object') return 'Employer-feed screening counts were not reported for this search.';
  const reported = COUNTS.filter(([key]) => Number.isSafeInteger(summary[key]) && summary[key] >= 0);
  if (!reported.length) return 'Employer-feed screening counts were not reported for this search.';
  const counts = reported.map(([key, singular, plural]) => `${summary[key]} ${summary[key] === 1 ? singular : plural}`).join(' · ');
  return `Employer-feed screening: ${counts}.${reported.length < COUNTS.length ? ' Other screening counts were not reported.' : ''}`;
}
