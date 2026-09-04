const PRODUCT_OWNER_SUBJECTS = new Set(['evan@1ststep.ai']);

function normalizedSubjects(value) {
  return String(value || '')
    .split(',')
    .map(subject => subject.trim().toLowerCase())
    .filter(Boolean);
}

export function administratorSubjects(env = process.env) {
  return new Set([
    ...PRODUCT_OWNER_SUBJECTS,
    ...normalizedSubjects(env.OWNER_ACCESS_EMAILS),
  ]);
}

export function isAdministratorSubject(subject, env = process.env) {
  return administratorSubjects(env).has(String(subject || '').trim().toLowerCase());
}
