import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'docs', 'production-readiness', 'ai-use-cases');
const requiredQuestions = [
  'userProblem', 'automationEvidence', 'requiredData', 'agentReadScope', 'agentChangeScope',
  'humanApproval', 'safeFailure', 'pauseOrRevoke', 'costPerUser', 'costPerOperation',
  'successMeasurement', 'removalCriteria',
];
const requiredScores = [
  'technologyReadiness', 'workflowValue', 'userReadiness', 'dataReadiness',
  'expectedBusinessValue', 'securityPrivacyGovernanceRisk',
];
const allowedDecisions = new Set(['approve-controlled-pilot', 'revise', 'reject', 'blocked']);

const files = (await readdir(directory)).filter((file) => file.endsWith('.json') && file !== 'template.json');
assert(files.length > 0, 'At least one AI use-case assessment is required.');

for (const file of files) {
  const assessment = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
  assert.equal(assessment.schemaVersion, 1, `${file}: unsupported schemaVersion.`);
  assert(assessment.featureId && assessment.featureName && assessment.owner, `${file}: feature identity and owner are required.`);
  assert(allowedDecisions.has(assessment.productionDecision), `${file}: invalid productionDecision.`);
  assert(assessment.reviewedAt && assessment.expiresAt, `${file}: review and expiration dates are required.`);
  assert(Date.parse(assessment.expiresAt) > Date.parse(assessment.reviewedAt), `${file}: expiration must follow review.`);
  assert(Date.parse(assessment.expiresAt) > Date.now(), `${file}: assessment is expired and must be reviewed again.`);
  for (const key of requiredQuestions) {
    assert(typeof assessment.answers?.[key] === 'string' && assessment.answers[key].trim().length >= 12, `${file}: answer ${key} is incomplete.`);
  }
  for (const key of requiredScores) {
    const score = assessment.scores?.[key];
    assert(Number.isInteger(score) && score >= 1 && score <= 5, `${file}: score ${key} must be an integer from 1 to 5.`);
    assert(typeof assessment.rationales?.[key] === 'string' && assessment.rationales[key].trim().length >= 12, `${file}: rationale ${key} is incomplete.`);
  }
  assert(Array.isArray(assessment.evidence) && assessment.evidence.length > 0, `${file}: evidence or explicit unknowns are required.`);
  assert(Array.isArray(assessment.blockers), `${file}: blockers must be an array.`);
  if (assessment.productionDecision === 'blocked') assert(assessment.blockers.length > 0, `${file}: a blocked decision must name its blockers.`);
  if (assessment.productionDecision === 'approve-controlled-pilot') {
    assert.equal(assessment.blockers.length, 0, `${file}: an approved pilot cannot retain blockers.`);
    assert.equal(assessment.humanApprovalRequired, true, `${file}: consequential AI features require an explicit human approval boundary.`);
  }
}

console.log(`AI use-case gate passed: ${files.length} assessment(s) are complete and decisioned.`);
