# Job Agent legal and compliance guardrails

Last reviewed: 2026-08-29. This is a product-control checklist, not legal advice. Qualified counsel must approve the privacy notice, terms, consent language, employer/ATS interaction model, retention schedule, and incident-notification procedure before external application execution is enabled.

## Product position

1stStep is a candidate-directed search and application-preparation service. It does not make hiring decisions for employers. It must not claim guaranteed interviews, offers, application counts, or unrestricted access to every job site. It must describe current capabilities accurately and disclose when AI assists with ranking or drafting.

The supervised beta must remain 18+ until counsel approves a minor-user policy and any required parental consent or age-assurance process. Do not collect a date of birth merely to enforce this boundary; use a terms attestation at account creation or purchase.

## Binding product rules

- The candidate controls their facts. Only user-confirmed facts with matching meaning and scope may be reused.
- Never infer or rank on race, color, religion, sex, pregnancy, sexual orientation, gender identity, national origin, age, disability, genetic information, veteran status, or other protected characteristics.
- Before calculating any fit component, structurally redact protected-trait, optional-demographic, authorization/citizenship/sponsorship, clearance/export-control, criminal-history, health/drug/medical, referral, restrictive-agreement, and outside-employment language from both requisition requirements and candidate evidence. Preserve only category-level `notRankedSignals` for auditability; do not retain the sensitive value in score evidence.
- Never infer citizenship, immigration or export-control classification, work authorization, clearance, criminal history, disability, veteran status, referrals, restrictive agreements, certifications, or unsupported experience.
- Optional demographics default to unanswered or prefer not to answer. They are never inputs to job ranking.
- Ask only the minimum information needed for the candidate-requested service. Do not use application data to train a general model, target advertising, set individualized prices, or build unrelated profiles without separate specific consent and counsel review.
- Explain the exact purpose, recipient, requisition, document version, field categories, and expiration before personal-data transmission. Final submission is a separate confirmation.
- Never receive or retain employer passwords, OTPs, CAPTCHA answers, identity-verification answers, or browser cookies. Challenge completion happens directly in the isolated employer session.
- Provide correction, provenance, revocation, export, backup opt-out, and deletion controls. Revocation must be as easy as consent.
- Store consent as a tenant-partitioned, encrypted, versioned record with the exact policy versions, SHA-256 document/disclosure fingerprints, and required scopes. A version or fingerprint change—and every legacy record without the fingerprints—must fail closed until the candidate affirmatively reaccepts; revocation pauses active work before it can resume.
- Count Submitted only after authoritative employer-side evidence. A model statement, filled form, button click, network request, or submission attempt is not a receipt.
- Use no dark patterns. Refusing optional processing must not make the core service deceptively difficult.
- Needs You email reminders require a separate unchecked opt-in and an equally easy opt-out. The reminder must remain generic, must not disclose employer or application details in subject/body text, and must not be used for marketing without separate consent. Provider acceptance is not proof of delivery or user action.

## Current official-law signals

These sources establish the conservative floor used by the product. Applicability and exemptions depend on facts, scale, residency, contracts, and future rulemaking.

- The [New Jersey Data Privacy Act](https://pub.njleg.gov/Bills/2022/PL23/266_.HTM) defines consent as a freely given, specific, informed, unambiguous affirmative act; excludes broad terms and dark patterns; requires appropriate security; requires consent before processing sensitive data; requires an effective revocation mechanism; and calls for data-protection assessments for processing that presents a heightened risk of harm. Its applicability includes volume and revenue/data-sale thresholds that counsel must evaluate rather than assume.
- The [California Privacy Protection Agency's consumer FAQ](https://cppa.ca.gov/faq) summarizes rights to limit, opt out, correct, know, equal treatment, and delete, along with purpose limitation, data minimization, and proportionality. It identifies citizenship/immigration status, account access information, precise geolocation, health, race or ethnicity, religion, sexual orientation, genetics, and identifying biometrics as sensitive information.
- California's [2025 final regulations](https://cppa.ca.gov/regulations/ccpa_updates.html) include risk-assessment, cybersecurity-audit, and automated-decisionmaking requirements effective from 2026 on schedules and for businesses within their scope. Counsel must determine whether and when 1stStep crosses each threshold.
- The EEOC's [2024-2028 Strategic Enforcement Plan](https://www.eeoc.gov/sites/default/files/2023-09/SEP%20FY%2020242028%20FINAL%20APPROVED.pdf) identifies discriminatory use of technology in job advertising, recruitment, and hiring—and steering people into jobs based on protected characteristics—as enforcement priorities. 1stStep therefore excludes protected traits from ranking and keeps fit evidence job-related and explainable.
- The EEOC's [AI and ADA resource hub](https://www.eeoc.gov/eeoc-disability-related-resources/artificial-intelligence-and-ada) highlights disability-related risks from hiring software. The candidate interface and support process must provide accessible alternatives and must not penalize a user for needing accommodation or human help.
- The FTC has stated that existing laws still apply to AI and can reach unfair or deceptive practices. Its [AI enforcement statement](https://www.ftc.gov/news-events/news/press-releases/2023/04/ftc-chair-khan-officials-doj-cfpb-eeoc-release-joint-statement-ai) and [privacy guidance](https://www.ftc.gov/business-guidance/blog/2023/06/hey-alexa-what-are-you-doing-my-data) support truthful capability claims, meaningful user control, limited employee/contractor access, honored deletion commitments, and retention proportional to the service.

## Documents counsel must approve

Before inviting users outside a closely supervised pilot:

1. Plain-language Terms of Service defining candidate authority, prohibited use, no interview/offer guarantee, third-party employer systems, acceptable use, suspension, dispute terms, and the exact paid-plan promise.
2. Just-in-time Privacy Notice covering categories, purposes, retention, processors/subprocessors, AI providers, security, cross-border processing, consumer rights, appeals, contact method, and a clear statement that protected/sensitive traits are not ranking inputs.
3. Candidate authorization language for direct-employer discovery and document preparation, plus separate just-in-time transmission and final-submission confirmations.
4. Data Processing Addenda and security terms with hosting, model, email, payments, monitoring, and future browser-worker vendors. Confirm whether provider inputs are retained or used for training.
5. A documented data-protection/risk assessment for resume/profile processing, fit ranking, model drafting, application transmission, browser automation, and sensitive-data edge cases.
6. Employer/ATS terms matrix identifying allowed public-feed access, browser automation restrictions, account creation rules, request rates, robots/anti-bot expectations, and a stop/escalation owner for each supported system.
7. Retention and deletion schedule for guest telemetry, account records, vault versions, job runs, packages, application sessions, receipt evidence, audits, backups, support records, and legal holds.
8. Incident-response and breach-notification decision tree by state/country, with named counsel, security, communications, and support owners.
9. Transactional-email review covering sender authentication, opt-in evidence, suppression/bounce/complaint handling, unsubscribe expectations, processor retention, and whether any jurisdiction requires additional notice or consent.

The product control plane for item 3 is implemented, including age attestation without date-of-birth collection, four required affirmative acts rendered from the server policy bundle, exact checked-in Terms/Privacy and disclosure fingerprints, version-or-content renewal, encrypted tenant isolation, audit history, export/deletion inclusion, and an easy revoke-and-pause control. `npm run test:concierge` verifies that the committed Terms and Privacy files still match the digests bound into the consent record. A reviewed document change must update its policy version and checked-in digest together. This implementation is not approval of the wording: counsel must supply or approve the exact Terms, Privacy, candidate-authorization, and in-app disclosure versions before `JOB_AGENT_COUNSEL_APPROVED` may be enabled.

## Launch claims allowed now

- "Finds and filters supported direct-employer openings."
- "Ranks matches using job-related evidence from your confirmed profile."
- "Prepares restrained, role-specific ATS resumes and cover letters for review."
- "Keeps one Needs You queue and resumes saved work."
- "Does not send an application without a separate confirmation."

Do not claim "applies everywhere," "guaranteed interviews," "fully autonomous," "human-written" without qualification, "zero risk," or "submitted" without employer receipt evidence. AI-assisted materials may be described as restrained and human-looking, but not falsely represented as having been authored by a human if that statement would be material.

## Review cadence

Re-run legal and subprocessor review before enabling a new state/country, paid plan, model provider, advertising use, analytics identifier, browser-worker vendor, employer/ATS connector, identity feature, or material retention change. Review this file at least quarterly during beta because privacy and AI rules are changing quickly.
