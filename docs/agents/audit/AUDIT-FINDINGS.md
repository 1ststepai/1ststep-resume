# Durable independent audit findings

The rows below are **seeded audit tracks from dated engineering/live-path evidence**, not independently validated findings or severity assignments. The auditor must verify each against the current exact source and environment. Never silently delete an ID; resolve it only with dated regression and, where required, hosted evidence. `UNKNOWN` is not a pass. The Orchestrator records accepted updates from the auditor's read-only handoff.

| ID | Severity | Product area | First observed commit | Latest affected commit | Status | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH-001` | UNRATED | Clerk/session | UNKNOWN — dated prior investigation | UNKNOWN — recheck current candidate | SEEDED — UNVERIFIED | Preview instance consistency was corrected on a later exact-head Preview, but authenticated browser/session proof remained blocked at client initialization. |
| `DATA-001` | UNRATED | Redis/Postgres/tenant data | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Source/schema contracts do not establish hosted RLS, isolation, recovery, or cross-session persistence. |
| `RESUME-001` | UNRATED | Résumé/Saved Info/Vault/Career Profile | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Reconcile the authority and versioning of legacy résumé, Saved Info, Vault, and Career Profile paths. |
| `CAPTURE-001` | UNRATED | Extension capture/My Jobs | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Exact-head authenticated capture, canonical requisition deduplication, and durable readback remain to be proven. |
| `STATE-001` | UNRATED | Application state/receipt | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Verify that attempted or filled actions cannot become `Submitted` without an authoritative employer receipt. |
| `EXT-001` | UNRATED | Chrome extension | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Reconcile source candidate, controlled artifact, installed package, and published Web Store version. |
| `PARTNER-001` | UNRATED | Partner identity/isolation/claims | UNKNOWN | UNKNOWN | SEEDED — UNVERIFIED | Verify separate partner role and data boundary against live public capability claims. |

## Per-finding evidence requirements

| ID | Required remediation or decision if confirmed | Required regression evidence | Hosted verification required | Blocks limited beta | Blocks Production | Resolution evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH-001` | Route the first proven auth divergence to Identity & Data; no credential or domain change by auditor. | Readiness, client, exchange, authenticated denial, refresh/logout/second-login tests. | YES — exact Preview; Production separately before release. | YES until signed path proven | YES | NONE |
| `DATA-001` | Route proven authorization/persistence gap; do not activate or migrate a database from static evidence. | Role-aware RLS, two-tenant denial, write/read/restore/export/delete. | YES | YES if durable user path depends on it | YES | NONE |
| `RESUME-001` | Orchestrator chooses canonical authority only after truth/retention review. | Version conflict, unsupported-claim, save/reload/export/delete tests. | YES for cross-session claims | YES if promised in beta | YES | NONE |
| `CAPTURE-001` | Route first capture divergence; preserve idempotency and no-submit boundary. | Distinct capture IDs for same requisition, replay, refresh, sign-out/in, failures. | YES — supported live fixture | YES if capture is in beta | YES if claimed | NONE |
| `STATE-001` | Route receipt/state defect; never infer submission from attempted action. | Negative attempted/2xx/timeout cases plus authoritative receipt transition. | YES before any execution claim | YES for state truth | YES | NONE |
| `EXT-001` | Release Manager reconciles versions; publication remains owner-controlled. | Manifest, permissions, package digest, bridge and app-compatibility tests. | YES — installed/Store status | YES if extension is in beta | YES if claimed | NONE |
| `PARTNER-001` | Orchestrator/owner resolves partner role and public claims; no payout activation. | Isolation, consent, admin approval, self-referral, lifecycle, copy tests. | YES before operational claim | NO for job-seeker-only beta | YES for partner launch | NONE |

For every accepted finding update, retain ID, severity, product area, first observed commit, latest affected commit, status, summary, required remediation, required regression evidence, hosted-verification requirement, limited-beta/Production impact, and resolution evidence. If a field cannot be proven, leave `UNKNOWN`; do not manufacture a commit or downgrade a finding because a local test passes.
