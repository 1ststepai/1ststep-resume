// Partner referral attribution for app.1ststep.ai.
// An anonymous visit only stores the code in this browser (first touch wins,
// 60-day window). After sign-in it is sent once to /api/partner, which records
// it only for approved partners, rejects self-referrals, and never grants commission.
const KEY = '1ststep_referral_attribution';
export const REFERRAL_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export function cleanReferralCode(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

export function readReferral(storage, now = Date.now()) {
  try {
    const record = JSON.parse(storage.getItem(KEY) || 'null');
    const code = cleanReferralCode(record?.referralCode);
    const capturedAt = Date.parse(record?.capturedAt);
    if (!code || !Number.isFinite(capturedAt) || now - capturedAt > REFERRAL_WINDOW_MS) return null;
    return { ...record, referralCode: code };
  } catch { return null; }
}

export function captureReferral(search, storage, now = Date.now()) {
  const params = new URLSearchParams(search || '');
  const code = cleanReferralCode(params.get('ref') || params.get('partner') || params.get('affiliate'));
  if (!code) return null;
  const existing = readReferral(storage, now);
  if (existing) return existing;
  const record = {
    referralCode: code,
    capturedAt: new Date(now).toISOString(),
    utmSource: String(params.get('utm_source') || '').slice(0, 80),
    utmMedium: String(params.get('utm_medium') || '').slice(0, 80),
    utmCampaign: String(params.get('utm_campaign') || '').slice(0, 80),
  };
  storage.setItem(KEY, JSON.stringify(record));
  return record;
}

// Returns the HTTP status once a final answer is recorded, or null to retry on a later visit.
export async function submitReferral({ storage, fetchImpl, now = Date.now(), headers = {} }) {
  const record = readReferral(storage, now);
  if (!record || record.submittedAt) return null;
  const response = await fetchImpl('/api/partner?action=attribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ code: record.referralCode }),
  });
  if (response.status === 401 || response.status === 429 || response.status >= 500) return null;
  storage.setItem(KEY, JSON.stringify({ ...record, submittedAt: new Date(now).toISOString(), outcome: response.status }));
  return response.status;
}

if (typeof window !== 'undefined' && window.location) {
  try { captureReferral(window.location.search, window.localStorage); } catch { /* storage unavailable */ }
}
