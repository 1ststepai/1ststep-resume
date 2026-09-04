import { createHash } from 'node:crypto';

const PRIVATE_HOST = /^(?:localhost|localhost\.|0\.0\.0\.0|127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;
const INSTRUCTION_PATTERNS = Object.freeze([
  /ignore (?:all|any|the|previous|prior) (?:instructions?|rules?|polic(?:y|ies))/i,
  /(?:system|developer|assistant)\s*(?:prompt|message|instruction)/i,
  /(?:reveal|print|return|exfiltrate|send)\s+(?:the\s+)?(?:secret|token|password|prompt|credential)/i,
  /(?:call|use|invoke|enable)\s+(?:a\s+)?(?:tool|browser|shell|terminal|api)/i,
  /(?:submit|apply|transmit)\s+(?:without|immediately|automatically)/i,
]);

const ACTIVE_MARKUP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']);

function textOutsideMarkup(value) {
  const source = String(value);
  let output = '';
  let cursor = 0;
  let blockedTag = '';
  let blockedDepth = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);
    if (tagStart < 0) {
      if (!blockedTag) output += source.slice(cursor);
      break;
    }
    if (!blockedTag) output += source.slice(cursor, tagStart);
    const tagEnd = source.indexOf('>', tagStart + 1);
    if (tagEnd < 0) {
      if (!blockedTag) output += source.slice(tagStart);
      break;
    }

    const token = source.slice(tagStart + 1, tagEnd).trim();
    const closing = token.startsWith('/');
    const name = token.replace(/^\/\s*/, '').match(/^[A-Za-z0-9:-]+/)?.[0]?.toLowerCase() || '';
    const selfClosing = token.endsWith('/');

    if (blockedTag) {
      if (name === blockedTag) {
        if (closing) blockedDepth -= 1;
        else if (!selfClosing) blockedDepth += 1;
        if (blockedDepth <= 0) {
          blockedTag = '';
          blockedDepth = 0;
        }
      }
    } else if (ACTIVE_MARKUP.has(name) && !closing && !selfClosing) {
      blockedTag = name;
      blockedDepth = 1;
    } else {
      output += ' ';
    }
    cursor = tagEnd + 1;
  }

  return output;
}

export function normalizeUntrustedJobText(value, { maxChars = 50_000 } = {}) {
  const source = String(value ?? '').normalize('NFKC');
  const withoutActiveMarkup = textOutsideMarkup(source.replace(/<!--[\s\S]*?-->/g, ' '))
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(?:lt|gt);/gi, ' ')
    .replace(/&amp;/gi, '&')
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
