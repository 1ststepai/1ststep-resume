# Applicant knowledge model

## Canonical entities

```text
Applicant
└── CareerProfile (versioned projection)
    ├── FactVersion[]
    ├── PreferenceVersion[]
    ├── PolicyVersion[]
    ├── AnswerVersion[]
    ├── EvidenceReference[]
    └── DocumentVersion[]
```

Every item requires:

| Field | Meaning |
| --- | --- |
| `id`, `tenant_id`, `version` | stable scoped identity and immutable history |
| `kind` | fact, preference, policy, application_answer, career_data, document_data, temporary, job_specific, sensitive |
| `canonical_key` | deterministic reusable identity |
| `value_ciphertext` or object reference | private value outside logs/client projections |
| `source_type`, `source_ref`, `source_excerpt_hash` | provenance without duplicating private text |
| `verification_state` | unverified, inferred, user_confirmed, source_verified, revoked |
| `confidence_components` | measurable evidence, not a model assertion |
| `verified_at`, `expires_at`, `last_used_at` | lifecycle |
| `reuse_scope` | none, application, employer, career_track, global |
| `safe_to_reuse` | deterministic gate result |
| `sensitivity` | ordinary, consequential, sensitive, prohibited |
| `automation_permission_id` | exact active permission or null |
| `supersedes_id`, `revoked_at` | corrections and deletion |

## Truth classes

- **VERIFIED FACT:** directly user-confirmed or verified from an accepted source.
- **INFERRED INFORMATION:** suggestion only; cannot support an external representation until confirmed.
- **USER PREFERENCE:** desired behavior, not a statement of career history.
- **AI-GENERATED LANGUAGE:** a rendering derived from cited facts; never promoted to fact.
- **UNVERIFIED CLAIM:** blocked from application packages and external answers.

## Question memory

Question reuse is a classification problem plus a safety policy:

1. Normalize wording and map to a canonical question concept.
2. Determine type: stable fact, preference/policy, employer/application-specific, sensitive, or prohibited.
3. Retrieve only active, unexpired, scope-compatible answer versions.
4. Require action-time confirmation for consequential or context-dependent answers.
5. Show the source and last-confirmed date before reuse when risk is material.
6. Record the exact application and field where a version was used.

Examples:

| Question | Type | Default scope | Reuse |
| --- | --- | --- | --- |
| U.S. work authorization | stable consequential fact | global | confirm initially and after expiry/policy change |
| Future sponsorship | stable consequential fact | global | same |
| Willing to relocate | preference/policy | career track/global | reuse within policy version |
| Desired salary | policy | career track/location | evaluate, do not paste blindly |
| Start date | temporary | application | short expiry |
| Why this employer? | job-specific generated answer | application | never reuse verbatim across employers |
| Demographic question | sensitive | application | prefer unanswered/user action; never infer |
| OTP/CAPTCHA/password | prohibited | none | never store or reuse |

## Career Profile projection

The UI receives a safe projection: completeness by capability, missing blockers, labels, sources, and verification dates. Private values are returned only where necessary and authorized. The package engine requests fact references and versions, not a whole free-form profile dump.

## Migration

- Import legacy `1ststep_profile`, resume, tailoring, and tracker data into a review queue.
- Mark source as `legacy_browser_import`; never mark `applied` as receipt-backed.
- Hash and dedupe exact documents/jobs before creation.
- Ask the user to confirm high-impact facts; low-risk formatting may be normalized deterministically.
- Preserve the original JSON export until reconciliation succeeds and is acknowledged.
