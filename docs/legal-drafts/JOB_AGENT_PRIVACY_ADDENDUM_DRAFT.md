> **DRAFT FOR COUNSEL REVIEW — NOT LEGAL ADVICE — NOT IN EFFECT**
>
> Drafted by an engineering assistant to describe the Job Agent's actual data handling as
> implemented, so counsel has an accurate factual basis. **Not** reviewed or approved by a
> lawyer, **not** served to users, and **not** referenced by the consent flow.
> `JOB_AGENT_COUNSEL_APPROVED` remains unset.
>
> Do not publish or present any part of this text to users as a privacy policy.

# Job Agent Addendum to the Privacy Policy — Draft

**Status:** Draft v0.1 · Not approved · Not in effect
**Intended relationship to existing Policy:** Addendum to `privacy.html`, or new numbered
sections within it. Counsel to decide.

---

## 1. The confirmed-fact vault

The Job Agent maintains a structured store of facts about you — the "fact vault" — used to
fill application forms without re-asking you the same question.

Each fact carries:

- **Value** — the answer itself.
- **Provenance** — where it came from (you typed it, it was extracted from a résumé you
  uploaded, or you confirmed a suggestion).
- **Confidence** — how reliable the source is.
- **Verification state** — whether you have explicitly confirmed it.
- **Version history** — prior values, so a change is auditable and reversible.

**A fact is not reused in an application until you have confirmed it.** Unconfirmed or
extracted-but-unverified values are surfaced to you for confirmation instead of being used.

You can view, correct, re-confirm, or delete any fact at any time. Deleting a fact removes
it from future reuse.

## 2. Résumé and document processing

Résumés and documents you provide are processed to extract structured facts and to generate
role-specific materials. Extraction is a proposal: extracted values enter the vault in an
unconfirmed state and require your confirmation before reuse.

Generated documents are stored so you can review, revise, and re-download them.

## 3. Employer and ATS field extraction

To prepare an application the Job Agent reads the **structure** of an employer application
form — the field labels, types, and whether each is required. This describes the form, not
you, and is used to determine which of your confirmed facts apply and which questions must
be routed to you.

## 4. Personal-data transmission boundaries

Your personal data is not transmitted to an employer or applicant tracking system as part of
preparation. Transmission occurs only after you confirm that specific action at the time it
happens.

Where a value is displayed during preparation, sensitive values are masked in the interface.

## 5. Categories of data processed

- **Identity and contact details** you provide.
- **Career history** — employers, titles, dates, responsibilities, education, skills.
- **Documents** — résumés and generated application materials.
- **Job-search preferences** — target roles, locations, compensation expectations, filters.
- **Run and application records** — which roles were found, what was prepared, what you
  were asked, what you approved.
- **Audit evidence** — tamper-evident records of consequential actions.
- **Operational data** — rate-limit counters and spend accounting, kept in pseudonymous
  form and not linked to document content.

## 6. What is deliberately not stored

- Employer account **passwords**.
- **One-time passcodes** (OTPs).
- **CAPTCHA** answers.

These are never retained as reusable profile facts. Where such a step is required, it is
handed to you.

## 7. Sensitive and protected traits

Optional demographic questions (including race, ethnicity, gender, disability, and veteran
status where an employer asks them) **default to unanswered**. You may choose to answer them.

Protected traits are never used to rank, filter, or score opportunities, and the Job Agent
does not infer them.

The Job Agent does not infer citizenship or immigration status, security clearance,
export-control status, criminal history, disability, or veteran status. Such questions are
routed to you.

## 8. Encryption and storage

- Job Agent state is **envelope-encrypted** before storage, using a versioned key identifier
  so keys can be rotated without losing access to existing records.
- Encryption is bound to the specific record, so an envelope cannot be replayed into a
  different context.
- Private documents are held in **private object storage**. They are not published to a
  public URL, and access requires an authenticated, authorized request.
- Signed-in sessions use opaque, revocable session tokens in HttpOnly cookies. The session
  token is not readable by page scripts and does not itself contain your personal data.

**Beta limitation:** where required durable storage or encryption is unavailable, the
affected feature fails closed — it refuses to operate rather than falling back to a less
protected path.

## 9. Browser-assisted processing

Where a browser extension or an isolated browser session is used to assist with an
application form, that processing is scoped to the specific application you are working on.
Field values are not persisted by the extension as a separate profile store, and credential
entry is not captured for reuse.

## 10. Retention and deletion

| Record | Retention |
|---|---|
| Confirmed facts | Until you delete them or close the account |
| Generated documents / artifacts | Bounded retention window, then automatic expiry |
| Run records | Bounded retention, then expiry |
| Session records | Until expiry, sign-out, or revocation |
| Receipts and audit evidence | Retained for integrity of application status |
| Email suppression records | Retained to honor opt-outs |

*Counsel to set exact durations. The implementation uses a 30-day artifact retention window
and a configurable suppression window; audit-evidence retention is a policy decision.*

Deletion requests remove the underlying records. Where a record must be retained for
integrity — for example evidence that an application was actually submitted — that is
identified and explained rather than silently kept.

## 11. Service providers

Categories of processors used:

- Cloud hosting and serverless execution
- Durable key-value storage
- Private object storage
- AI model providers for document generation
- Transactional email delivery
- Payment processing
- Malware scanning of uploaded documents
- Customer relationship management

*Counsel to decide whether named subprocessors and a change-notification mechanism are
required for the operative jurisdictions.*

## 12. Data minimization

The Job Agent asks for a fact when a specific application needs it, rather than collecting a
comprehensive profile in advance. Operational records are content-free where possible:
spend and rate-limit accounting uses pseudonymous identifiers and does not carry document
content or personal values.

## 13. Security limitations

No system is perfectly secure. The Job Agent is in controlled beta. We do not claim any
security certification or compliance attestation that has not been independently verified.

## 14. Your rights and how to exercise them

Depending on where you live you may have rights to access, correct, delete, port, or
restrict processing of your data, and to withdraw consent.

Within the product you can review and correct facts, revoke Job Agent authorization, pause
activity, and request deletion.

*Counsel to specify the contact route, response timeline, verification method, appeal path,
and any jurisdiction-specific disclosures (GDPR lawful basis, CCPA/CPRA categories and
"sale/share" position, automated decision-making disclosures).*

---

## Open questions for counsel

1. What is the lawful basis under GDPR for each processing purpose — consent, contract, or
   legitimate interests — and does the current consent flow satisfy it?
2. Does agent-assisted application preparation constitute automated decision-making or
   profiling requiring specific disclosure or opt-out?
3. Must subprocessors be named individually, with a change-notification mechanism?
4. What retention periods are defensible for audit evidence and receipts, given they exist
   partly to protect the user's own record of what was submitted?
5. Under CCPA/CPRA, do any transfers constitute a "sale" or "share"?
6. How should optional demographic answers be characterized — as sensitive personal
   information with heightened obligations?
7. Are there additional obligations where the user is in the EU/UK and the employer is not?
8. Does the extension's processing need separate disclosure, and does it align with Chrome
   Web Store data-use representations?
9. Is a Data Protection Impact Assessment required before the beta widens?
10. What must be said about international transfers and the transfer mechanism relied upon?
