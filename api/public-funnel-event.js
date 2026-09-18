import { applyApiHeaders, hasJsonContentType, isOriginAllowed, requestIp } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { Redis } from '@upstash/redis';

export const maxDuration = 10;

export const PUBLIC_FUNNEL_EVENTS = Object.freeze([
  'landing_viewed',
  'primary_cta',
  'product_demo_interaction',
  'signup_started',
  'signup_completed',
  'waitlist_submitted',
  'onboarding_started',
  'onboarding_completed',
]);

const EVENT_SET = new Set(PUBLIC_FUNNEL_EVENTS);

export function normalizePublicFunnelEvent(value) {
  const event = String(value || '').trim();
  return EVENT_SET.has(event) ? event : '';
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });

  const event = normalizePublicFunnelEvent(req.body?.event);
  if (!event) return res.status(400).json({ error: 'Unknown funnel event.' });
  if (req.body?.resume || req.body?.savedInfo || req.body?.answers || req.body?.email) {
    return res.status(400).json({ error: 'Funnel events cannot include application content.' });
  }

  const ip = requestIp(req);
  const durableLimit = await enforceDurableRateLimit(req, {
    scope: 'public-funnel-event',
    ip,
    ipRule: { limit: 40, window: '1 h' },
    globalRule: { limit: 20_000, window: '1 d' },
  });
  if (!durableLimit.ok) return sendRateLimitResult(res, durableLimit, 'Too many events.');

  const url = String(process.env.UPSTASH_REDIS_REST_URL || '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (url && token) {
    const day = new Date().toISOString().slice(0, 10);
    const redis = Redis.fromEnv();
    await redis.incr(`1ststep:public-funnel:v1:${day}:${event}`);
  }
  return res.status(204).end();
}
