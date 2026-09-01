import { createHash } from 'node:crypto';

const PRIVATE_HOST = /^(?:localhost|localhost\.|0\.0\.0\.0|127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;
const INSTRUCTION_PATTERNS = Object.freeze([
  /ignore (?:all|any|the|previous|prior) (?:instructions?|rules?|polic(?:y|ies))/i,
  /(?:system|developer|assistant)\s*(?:prompt|message|instruction)/i,
  /(?:reveal|print|return|exfiltrate|send)\s+(?:the\s+)?(?:secret|token|password|prompt|credential)/i,
  /(?:call|use|invoke|enable)\s+(?:a\s+)?(?:tool|browser|shell|terminal|api)/i,
  /(?:submit|apply|transmit)\s+(?:without|immediately|automatically)/i,
]);

export function normalizeUntrustedJobText(value, { maxChars = 50_000 } = {}) {
  const source = String(value ?? '').normalize('NFKC');
  const withoutActiveMarkup = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|svg|math)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutActiveMarkup.slice(0, Math.max(1_000, Math.min(100_000, Number(maxChars) || 50_000)));
}

export function analyzeUntrustedJobContent(value, options = {}) {
  const normalizedText = normalizeUntrustedJobText(value, options);
  const instructionSignals = INSTRUCTION_PATTERNS
    .map((pattern, index) => pattern.test(normalizedText) ? `UNTRUSTED_INSTRUCTION_PATTERN_${index + 1}` : null)
    .filter(Boolean);
  return Object.freeze({
    normalizedText,
    sha256: createHash('sha256').update(normalizedText).digest('hex'),
    instructionSignals,
    trust: 'untrusted-evidence-only',
    grantsAuthorization: false,
    grantsToolPermission: false,
  });
}

export function validatePublicHttpsDestination(value, { allowedHosts = [] } = {}) {
  const target = new URL(String(value || '').trim());
  const host = target.hostname.toLowerCase();
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')) throw new Error('Only a public HTTPS destination is allowed.');
  if (!host.includes('.') || PRIVATE_HOST.test(host) || /^\d+(?:\.\d+){3}$/.test(host) || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private-network destinations are not allowed.');
  if (allowedHosts.length && !allowedHosts.map(item => String(item).toLowerCase()).includes(host)) throw new Error('The destination host is not allowlisted.');
  target.hash = '';
  return target.href;
}
