import { createHash } from 'node:crypto';
import { PRODUCTION_ENVIRONMENT_CONTROLS } from './job-agent-production-environment-report.js';

const SAFE_ENVIRONMENT = new Set(['production', 'preview', 'development']);
const SAFE_KEY = /^[A-Z][A-Z0-9_]{1,127}$/;
const ALLOWED_ENTRY_FIELDS = new Set(['key', 'type', 'target', 'configurationId', 'createdAt', 'updatedAt']);

function targetsFor(value) {
  return (Array.isArray(value) ? value : [value])
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean);
}

function requiredNames(requirement) {
  return Array.isArray(requirement.variableNames) ? requirement.variableNames : [requirement.variableNames];
}

export function auditVercelEnvironmentNames(payload, { environment = 'production' } = {}) {
  const normalizedEnvironment = String(environment || '').trim().toLowerCase();
  if (!SAFE_ENVIRONMENT.has(normalizedEnvironment)) throw new Error('Unsupported Vercel environment name.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.envs)) {
    throw new Error('Vercel environment inventory schema is invalid.');
  }

  const names = new Set();
  for (const entry of payload.envs) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Vercel environment inventory entry is invalid.');
    const fields = Object.keys(entry);
    if (fields.some(field => !ALLOWED_ENTRY_FIELDS.has(field))) throw new Error('Vercel environment inventory contains an unsupported field.');
    const key = String(entry.key || '').trim();
    if (!SAFE_KEY.test(key)) throw new Error('Vercel environment inventory key is invalid.');
    const targets = targetsFor(entry.target);
    if (targets.length && !targets.includes(normalizedEnvironment)) continue;
    names.add(key);
  }

  const controls = PRODUCTION_ENVIRONMENT_CONTROLS.map(control => {
    const requirements = control.requirements.map(requirement => {
      const alternatives = requiredNames(requirement);
      const present = alternatives.some(name => names.has(name));
      return { id: requirement.id, presentByName: present, variableNames: alternatives };
    });
    const presentRequirementCount = requirements.filter(requirement => requirement.presentByName).length;
    return {
      id: control.id,
      stage: control.stage || 'signed-beta',
      requirementCount: requirements.length,
      presentRequirementCount,
      absentRequirementCount: requirements.length - presentRequirementCount,
      allNamesPresent: presentRequirementCount === requirements.length,
      missingVariableNames: requirements.filter(requirement => !requirement.presentByName).flatMap(requirement => requirement.variableNames),
    };
  });

  const required = new Set(PRODUCTION_ENVIRONMENT_CONTROLS.flatMap(control => control.requirements.flatMap(requiredNames)));
  const presentRequired = [...required].filter(name => names.has(name));
  return {
    schemaVersion: 1,
    environment: normalizedEnvironment,
    contentFree: true,
    containsSecretValues: false,
    performsWrites: false,
    configurationValuesValidated: false,
    deployedRuntimeVerified: false,
    observedVariableNameCount: names.size,
    requiredVariableNameCount: required.size,
    presentRequiredVariableNameCount: presentRequired.length,
    absentRequiredVariableNameCount: required.size - presentRequired.length,
    observedVariableNameDigest: createHash('sha256').update([...names].sort().join('\n')).digest('hex'),
    controls,
  };
}
