const BLOCKED_FIELD = /(?:social security|\bssn\b|tax(?:payer)? id|passport|driver'?s? licen[cs]e|date of birth|\bdob\b|\bage\b|gender|sex(?:ual)? orientation|race|ethnicity|religion|marital|disability|veteran|pronouns?|password|passcode|verification code|\botp\b|captcha|signature|e-?sign|certif(?:y|ication)|attest|consent|agree(?:ment)?|arbitration|background|consumer report|drug test|health screen|medical|outside employment|conflict of interest|citizen(?:ship)?|visa|sponsorship|export control|itar|security clearance|criminal|conviction|referral|salary acceptance|compensation acceptance|desired salary)/i;
const BLOCKED_TYPE = new Set(['password', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset']);
const SAFE_KEY = /^[A-Za-z0-9:_.-]{1,160}$/;
const PROTOTYPE_KEY = new Set(['__proto__', 'prototype', 'constructor']);

function clean(value, max) { return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max); }
function normalized(value) { return clean(value, 40_000).toLocaleLowerCase('en-US').replace(/[\s\u00A0]+/g, ' '); }
function semanticText(value) { return clean(value, 1_000).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.:-]+/g, ' '); }

function safeProfileValue(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return undefined;
  if (typeof value === 'string') return clean(value, 4_000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safeProfileValue(item, depth + 1)).filter(item => item !== undefined);
  if (typeof value !== 'object') return undefined;
  const output = Object.create(null);
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 100)) {
    const key = clean(rawKey, 160);
    if (!SAFE_KEY.test(key) || PROTOTYPE_KEY.has(key) || BLOCKED_FIELD.test(semanticText(key))) continue;
    const safeValue = safeProfileValue(rawValue, depth + 1);
    if (safeValue !== undefined) output[key] = safeValue;
  }
  return output;
}

function safeField(field = {}, index = 0) {
  if (['value', 'answer', 'defaultValue', 'currentValue', 'secretValue', 'checked'].some(key => Object.hasOwn(field, key))) throw new Error('AUTOFILL_FIELD_VALUES_FORBIDDEN');
  const key = clean(field.key || field.id || field.name, 160);
  const type = clean(field.type || 'text', 40).toLowerCase();
  const label = clean(field.label, 160);
  const semantic = [key, field.id, field.name, label, type].map(value => semanticText(value)).join(' ');
  if (!SAFE_KEY.test(key)) throw new Error(`AUTOFILL_FIELD_KEY_INVALID:${index}`);
  if (PROTOTYPE_KEY.has(key) || BLOCKED_TYPE.has(type) || BLOCKED_FIELD.test(semantic)) return null;
  const options = Array.isArray(field.options) ? field.options.slice(0, 50).map(value => clean(value, 160)).filter(Boolean) : [];
  return { key, type, label, required: field.required === true, options };
}

export function validateAutofillContext(input = {}) {
  const rawProfile = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile) ? input.profile : {};
  const profile = safeProfileValue(rawProfile) || Object.create(null);
  const profileJson = JSON.stringify(profile);
  const resume = clean(input.resume, 20_000);
  if (Buffer.byteLength(profileJson, 'utf8') > 12_000 || !Array.isArray(input.fields) || input.fields.length > 80) throw new Error('AUTOFILL_CONTEXT_INVALID');
  const fields = input.fields.map(safeField).filter(Boolean);
  if (!fields.length) throw new Error('AUTOFILL_NO_SAFE_FIELDS');
  const candidateSource = `${profileJson}\n${resume}`;
  return { profile, resume, fields, candidateSource };
}

export function buildAutofillUserMessage(context) {
  return `<candidate_provided_profile>\n${JSON.stringify(context.profile)}\n</candidate_provided_profile>\n<candidate_provided_resume>\n${context.resume}\n</candidate_provided_resume>\n<ordinary_form_field_schema>\n${JSON.stringify(context.fields)}\n</ordinary_form_field_schema>\nReturn a JSON object using only the exact field key values from ordinary_form_field_schema. Omit every field whose answer is not explicitly supported by the candidate-provided profile or resume.`;
}

function parseStrictMap(raw) {
  const text = clean(raw, 20_000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AUTOFILL_RESPONSE_INVALID');
  return parsed;
}

function sourceSupports(value, candidateSource) {
  const needle = normalized(value);
  if (!needle || needle.length > 2_000) return false;
  return normalized(candidateSource).includes(needle);
}

export function sanitizeAutofillResponse(raw, context) {
  const parsed = parseStrictMap(raw);
  const fields = new Map(context.fields.map(field => [field.key, field]));
  const map = Object.create(null);
  const omittedKeys = [];
  for (const [rawKey, rawValue] of Object.entries(parsed).slice(0, 80)) {
    const key = clean(rawKey, 160);
    const field = fields.get(key);
    if (!field || PROTOTYPE_KEY.has(key) || !['string', 'number'].includes(typeof rawValue) || !Number.isFinite(typeof rawValue === 'number' ? rawValue : 0)) { omittedKeys.push(key); continue; }
    const value = typeof rawValue === 'number' ? rawValue : clean(rawValue, 2_000);
    if (value === '' || !sourceSupports(value, context.candidateSource)) { omittedKeys.push(key); continue; }
    if (field.options.length && !field.options.some(option => normalized(option) === normalized(value))) { omittedKeys.push(key); continue; }
    map[key] = value;
  }
  return { map, omittedKeys: [...new Set(omittedKeys)].slice(0, 80) };
}
