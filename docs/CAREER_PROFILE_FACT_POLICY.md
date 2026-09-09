# Minimum safe Career Profile facts

Status: implementation contract for the Postgres Career Profile store/API. It does not activate storage, consent, reuse, or Production Postgres.

The Career Profile is fail closed: only keys exported by `lib/career-profile-fact-policy.js` may enter the canonical fact store. Every value must be user-confirmed or document-verified. Generated language, model inference, an unknown key, and a legacy field that cannot be mapped without changing meaning are not verified facts.

| Group | Canonical keys | Storage and reuse rule |
|---|---|---|
| Direct identifiers | `firstName`, `lastName`, `preferredName`, `email`, `phone`, `city`, `region`, `country` | Encrypted, sensitive, and reusable only through an active database scope grant plus action-time sharing approval. Exact street address and a combined legacy `location` are excluded. |
| Career evidence | `employment`, `education`, `skills`, `certifications`, `languages`, `linkedinUrl`, `portfolioUrl` | Encrypted and reusable only through an active database scope grant plus action-time sharing approval. Evidence and version provenance remain required. |
| Restricted application facts | `authorization`, `sponsorship` | Candidate-confirmed bounded answers only. Sensitive and manual-only: the import creates no reuse grant. Store no citizenship, nationality, visa class, immigration status, document identifier, or supporting identity document. |

Search choices and permissions are separate records, not facts: salary, start date, travel, relocation, remote geography, schedule, employer/role exclusions, recruiter contact, employer account creation, and privacy/terms choices.

Never store as Career Profile facts: exact street address; date of birth or age; race, ethnicity, religion, sex, gender, sexual orientation, pregnancy, marital/family status; disability, medical, drug or genetic information; veteran status; citizenship, nationality or immigration details; criminal or background-check answers; financial/credit data; Social Security, government or identity-document numbers; credentials, OTPs, CAPTCHA/security answers or tokens; references/contact permission; driving, clearance, export-control, outside-employment, former-employer/conflict, referral, restrictive-agreement or other employer-specific/legal answers.

Legacy import is non-destructive. `contact`, `address`, `location`, and `licenses` require user reconciliation into the narrower canonical fields. Other disallowed keys remain in the legacy vault until the applicable deletion/retention process removes them; they are not copied. Legacy `autoReuse` and embedded scope values never create a Postgres reuse grant. Accepted legacy authorization and sponsorship phrases are normalized to bounded codes rather than retaining citizenship or visa detail.

The boundary follows the EEOC's guidance to limit pre-employment information to what is essential for qualification, its separate caution against asking most applicants about citizenship, and the FTC's direction to collect and retain only information with a legitimate business need. These are design inputs, not legal approval: [EEOC pre-employment practices](https://www.eeoc.gov/prohibited-employment-policiespractices), [EEOC citizenship inquiries](https://www.eeoc.gov/pre-employment-inquiries-and-citizenship), [FTC data minimization](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business).

This contract resolves the minimum-field design portion of P0-1. Storage activation remains blocked until the published Terms and Privacy text accurately describes the encrypted Career Profile, retention, revocation/deletion behavior, processors and user controls, and that revision is reviewed and approved.
