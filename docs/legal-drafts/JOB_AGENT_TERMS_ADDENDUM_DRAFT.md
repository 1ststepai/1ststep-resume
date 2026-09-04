> **DRAFT FOR COUNSEL REVIEW — NOT LEGAL ADVICE — NOT IN EFFECT**
>
> This document was drafted by an engineering assistant to describe how the 1stStep.ai
> Job Agent actually behaves in the codebase, so that qualified counsel has an accurate
> factual basis from which to write binding terms. It has **not** been reviewed or
> approved by a lawyer. It is **not** currently served to users, is **not** referenced by
> the consent flow, and `JOB_AGENT_COUNSEL_APPROVED` remains unset.
>
> Do not publish, link, or present any part of this text to users as terms of service.

# Job Agent Addendum to the Terms of Service — Draft

**Status:** Draft v0.1 · Not approved · Not in effect
**Intended relationship to existing Terms:** Addendum incorporated into `terms.html`, or a
new numbered section within it. Counsel to decide which structure is preferable.
**Applies to:** The controlled-production beta of the 1stStep.ai Job Agent.

---

## 1. What the Job Agent is

The Job Agent is an optional, opt-in feature. It searches published employer job listings,
evaluates whether a role fits the facts you have confirmed, and prepares application
materials for your review. It operates on your instruction and on your behalf, within the
limits described in this addendum.

The Job Agent is offered as a **controlled beta**. Availability, capacity, and included
functionality may change, and the feature may be paused or withdrawn.

## 2. Your authorization

By completing the Job Agent consent flow, you authorize 1stStep.ai to, on your behalf:

- **Discover** publicly available job listings from direct-employer sources and applicant
  tracking systems, and evaluate their fit against facts you have confirmed.
- **Prepare** role-specific application materials — including tailored résumés and cover
  letters — derived from facts you have confirmed.
- **Assist with form completion** in a supervised workspace, populating application fields
  with values you have confirmed.

This authorization is **limited to your own job search**. You may not authorize the Job
Agent to act for another person.

## 3. Preparation, transmission, and submission are separate

These three stages are legally and technically distinct, and consent to one is never
consent to another:

| Stage | What happens | What authorizes it |
|---|---|---|
| **Preparation** | Materials are generated and stored for your review. Nothing leaves the platform. | The one-time Job Agent consent |
| **Transmission** | Personal data is sent to an employer or applicant tracking system. | A separate confirmation at the time of the action |
| **Final submission** | An application is formally submitted to an employer. | A separate confirmation at the time of the action |

Your initial Job Agent consent authorizes **preparation only**. It does not authorize
transmission of your personal data and does not authorize final submission.

## 4. Action-time confirmation

Before any transmission of your personal data to a third party, and before any final
submission of an application, the Job Agent will stop and ask you to confirm that specific
action. You will be shown what is about to be sent and where.

We will not remove, defer, or batch this confirmation into a blanket standing authorization.

## 5. Your responsibility for accuracy

You are responsible for reviewing every factual answer and every generated document before
it is transmitted or submitted.

- Generated materials are drafts derived from facts you supplied and confirmed.
- The Job Agent does not independently verify your employment history, education,
  credentials, or eligibility.
- You must not use the Job Agent to submit information you know to be false or misleading.
- Misrepresenting your qualifications, identity, or authorization to work may violate
  employer policy and applicable law, and is your responsibility, not ours.

## 6. What the Job Agent will never infer

The Job Agent does not guess, infer, or fabricate answers about:

citizenship or immigration status · security clearance · export-control status · criminal
history · disability · veteran status · referrals · restrictive covenants or non-compete
agreements · experience you have not confirmed

Where such a question appears on an application, the Job Agent will route it to you as an
item requiring your input rather than answering it.

Optional demographic questions default to unanswered. Protected traits are never used to
rank or filter opportunities.

## 7. Credentials, CAPTCHAs, and identity checks

- The Job Agent does **not** store employer account passwords, one-time passcodes (OTPs),
  or CAPTCHA answers as reusable profile facts.
- Where an employer site requires a password, an OTP, a CAPTCHA, or an identity or
  security-question check, the Job Agent stops and hands that step to you.
- You should never be asked to enter a credential into a field the Job Agent controls for
  the purpose of storing it for later reuse.

## 8. No guarantee of outcome

1stStep.ai does not guarantee, and makes no representation regarding:

- that any application will be received, read, or acted upon;
- that you will receive an interview, an offer, or employment;
- the number of opportunities that will be found;
- the accuracy, currency, or availability of any employer listing.

Any figures describing time saved, application volume, or outcomes are illustrative unless
expressly identified as measured results.

## 9. Employer and ATS terms

Employer career sites and applicant tracking systems are third-party services governed by
their own terms. You remain responsible for complying with the terms of any employer or
ATS you apply through.

The Job Agent may be unable to operate on a given employer site, and coverage may change
without notice, because of technical limitations, access restrictions, or the third party's
terms. Availability of any particular employer or ATS is not guaranteed.

## 10. Permitted and prohibited use

**Permitted:** using the Job Agent for your own genuine job search.

**Prohibited:**

- using it on behalf of another person or as a service to third parties;
- submitting knowingly false or misleading information;
- circumventing employer application limits, rate limits, or anti-automation controls;
- attempting to defeat, disable, or automate past a CAPTCHA, OTP, or identity check;
- using it to send bulk or indiscriminate applications without genuine interest;
- reselling, scraping, or redistributing listings or platform output.

## 11. Application status and receipts

An application is reported as **submitted** only when authoritative evidence of receipt from
the employer or applicant tracking system has been recorded. Statuses such as *prepared*,
*package ready*, or *awaiting your action* do not mean an application was sent.

Counts and tracker figures reflect verified receipts, not attempts.

## 12. Pause, revoke, correct, delete

At any time you may:

- pause a run or the Job Agent as a whole;
- correct or remove any confirmed fact;
- revoke your Job Agent authorization, which stops further agent activity;
- request deletion of your Job Agent data in accordance with the Privacy Policy.

Revocation is prospective. It does not retract an application already submitted to an
employer, which is outside our control.

## 13. Beta limitations, rate limits, suspension

The Job Agent is subject to per-run, per-user, and global limits on activity and cost, which
exist to protect users and the service and may change. We may suspend or limit access where
required for security, cost control, legal compliance, abuse prevention, or service
stability, and may discontinue the beta.

## 14. Fees

Any charge for the Job Agent will be disclosed and separately agreed before it applies.
Nothing in this addendum authorizes a charge by itself.

---

## Open questions for counsel

1. Should this be an addendum incorporated by reference, or a numbered section inside the
   existing Terms? The consent flow binds to a SHA-256 digest of the served document, so the
   structure affects versioning.
2. Does the agency relationship created in §2 require more explicit scope, duration, and
   termination language in the operative jurisdiction?
3. Is the §3 preparation/transmission/submission separation sufficient to establish that
   initial consent is not blanket authorization?
4. Does §5 adequately allocate responsibility for accuracy, given that the platform
   generates the draft text?
5. Are there jurisdictions where automated job-application assistance is separately
   regulated, or where employment-agency licensing could be implicated?
6. Does §7 need explicit language on circumvention of technical protection measures?
7. What consumer-protection constraints apply to §8, and to marketing claims generally?
8. Does the beta status need clearer disclosure of the possibility of data loss?
9. Should arbitration, governing law, and limitation-of-liability provisions from the main
   Terms be restated or expressly extended here?
10. Is re-acceptance required for existing users, or does forward-only consent suffice?
