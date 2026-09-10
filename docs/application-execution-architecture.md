# Application execution architecture

## Common adapter contract

```ts
interface ApplicationAdapter {
  detect(page): Detection;
  analyze(page): ValueFreeSchema;
  extractFields(page): FieldDefinition[];
  mapAnswers(task, schema): MappingResult;
  uploadResume(task, control): StepResult;
  fill(task): StepResult;
  validate(task): ValidationResult;
  submit(task): SubmissionAttempt; // separately enabled and approved
  verifySubmission(attempt): ReceiptEvidence;
  reportFailure(error): SafeFailure;
  requiresHuman(issue): HumanAction;
}
```

## Execution task

The server creates an immutable, short-lived task containing opaque application/session IDs, exact adapter/version, employer host, requisition, document version/hash, value-free field schema hash, approved field keys, permission/scope hash, expiry, and idempotency key. Candidate values and artifact bytes are retrieved transiently only after the task and session are revalidated.

## Responsibility split

| Responsibility | Server | Extension/worker |
| --- | --- | --- |
| job/profile/policy truth | Owns | Never invents |
| adapter selection/version | Owns allowlist | Confirms detection |
| answer mapping | Owns approved mapping | Applies exact mapped value |
| credentials/OTP/CAPTCHA | Never stores | Leaves in employer context; pauses |
| field fill/upload | Authorizes | Executes and reports keys only |
| form validation | Defines rules | Observes exact page result |
| final approval | Owns single-use permission | Cannot create it |
| submission | Reserves/arms task | Executes only when separately enabled |
| receipt | Independently verifies | May report attempt, never declare Submitted |

## Failure recovery

- Tab/browser/navigation loss: persist value-free checkpoint server-side; reopen exact employer URL and revalidate schema.
- DOM drift: adapter returns `SCHEMA_CHANGED`; invalidate approval and request review.
- Partial fill: report filled/failed keys; never resend all fields blindly.
- Provider timeout: `OUTCOME_UNKNOWN`; preserve provider reference and block retry.
- CAPTCHA/sign-in/OTP: one Needs You action with exact continuation point.
- Closed job: stop and record freshness evidence.
- Extension/server version mismatch: refuse task and show upgrade instruction.

## Adapter rollout order

1. Greenhouse fill reliability and production evidence.
2. Lever fill without submission.
3. Ashby fill without submission.
4. SmartRecruiters.
5. iCIMS only after variant taxonomy.
6. Workday only after tenant/version coverage proves maintainable.
7. Generic forms remain assisted/manual until strict confidence is demonstrated.

Each adapter needs fixture, live-safe read-only, failure-injection, schema-drift, security, accessibility, and version telemetry tests before production enablement.
