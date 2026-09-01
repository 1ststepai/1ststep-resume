import { test, expect } from '@playwright/test';
import { confirmApplicationApproval, createApplicationSession } from '../lib/application-session-domain.js';
import { planEmployerFormStep } from '../lib/employer-browser-worker.js';

function approvedSession() {
  const startedAt = new Date('2026-08-29T20:00:00.000Z');
  const created = createApplicationSession({
    packageRunId: 'run_rendered_fixture', packageQaVerified: true, documentVersion: 'fixture-rendered-v1',
    employer: 'Rendered Fixture Employer', title: 'Procurement Manager', requisitionId: 'REQ-200',
    directEmployerUrl: 'https://jobs.example.test/apply/REQ-200',
    proposedFields: [
      { fieldKey: 'firstName', label: 'First name', factId: 'fact_first_name', maskedPreview: 'J••••', confidence: 1, provenance: 'candidate-confirmed', ordinaryVerified: true },
      { fieldKey: 'email', label: 'Email', factId: 'fact_email', maskedPreview: 'j••••@example.test', confidence: 0.99, provenance: 'candidate-confirmed', ordinaryVerified: true },
    ],
  }, startedAt);
  return confirmApplicationApproval(created, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T20:01:00.000Z'));
}

async function extractedSchema(page) {
  return page.locator('input, select, textarea').evaluateAll(elements => elements.map((element, index) => {
    const id = element.id || `fixture_field_${index}`;
    const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent)
      || element.getAttribute('aria-label') || element.getAttribute('name') || id;
    return {
      fieldRef: id,
      fieldKey: element.dataset.fieldKey || element.getAttribute('name') || id,
      label: label.trim(),
      inputType: element.dataset.workerType
        || (element.tagName === 'SELECT' ? 'select' : element.tagName === 'TEXTAREA' ? 'textarea' : element.type || 'text'),
      required: element.required,
    };
  }));
}

test('rendered ordinary form stages only exact confirmed facts and leaves optional demographics unanswered', async ({ page }) => {
  await page.setContent(`
    <form>
      <label for="field_first">First name</label><input id="field_first" name="firstName" data-field-key="firstName" required>
      <label for="field_email">Email address</label><input id="field_email" name="email" data-field-key="email" type="email" required>
      <label for="field_veteran">Veteran status (optional)</label><select id="field_veteran" name="veteranStatus" data-field-key="veteranStatus"><option value="">Choose</option></select>
    </form>
  `);
  const fields = await extractedSchema(page);
  expect(fields.map(field => field.fieldKey)).toEqual(['firstName', 'email', 'veteranStatus']);
  const plan = planEmployerFormStep({
    session: approvedSession(), pageUrl: 'https://jobs.example.test/apply/REQ-200', fields,
    now: new Date('2026-08-29T20:02:00.000Z'),
  });
  expect(plan.actions).toEqual([]);
  expect(plan.status).toBe('ready-to-fill');
  expect(plan.stagedFields.map(item => item.fieldKey)).toEqual(['firstName', 'email']);
  expect(plan.leftUnanswered).toEqual([{ fieldRef: 'field_veteran', fieldKey: 'veteranStatus', reason: 'optional-consequential-question' }]);
  expect(JSON.stringify(plan)).not.toContain('j••••@example.test');
  expect(plan.externalApplicationExecution).toBe(false);
});

test('rendered secure and consequential fields become Human Action Required without captured values', async ({ page }) => {
  await page.setContent(`
    <form>
      <label for="field_password">Password</label><input id="field_password" name="accountPassword" data-field-key="accountPassword" type="password" required>
      <label for="field_otp">One-time verification code</label><input id="field_otp" name="verification" data-field-key="verification" autocomplete="one-time-code" required>
      <label for="field_captcha">Security CAPTCHA</label><input id="field_captcha" name="challenge" data-field-key="challenge" data-worker-type="captcha" required>
      <label for="field_identity">Government ID verification</label><input id="field_identity" name="identityCheck" data-field-key="identityCheck" required>
      <label for="field_cert">Electronic certification under penalty</label><input id="field_cert" name="attestation" data-field-key="attestation" type="checkbox" required>
      <label for="field_conflict">Outside employment conflict</label><select id="field_conflict" name="outsideWork" data-field-key="outsideWork" required><option>Choose</option></select>
      <label for="field_clearance">Security clearance</label><input id="field_clearance" name="clearance" data-field-key="clearance" required>
    </form>
  `);
  const plan = planEmployerFormStep({
    session: approvedSession(), pageUrl: 'https://jobs.example.test/apply/REQ-200', fields: await extractedSchema(page),
    now: new Date('2026-08-29T20:02:00.000Z'),
  });
  expect(plan.status).toBe('waiting-for-user');
  expect(plan.actions.map(item => item.type)).toEqual([
    'LOGIN', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION', 'NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT', 'AMBIGUOUS_FACT',
  ]);
  expect(plan.stagedFields).toEqual([]);
  expect(plan.credentialCollection).toBe(false);
  expect(plan.challengeValueCollection).toBe(false);
  expect(plan.finalSubmissionAuthorized).toBe(false);
});
