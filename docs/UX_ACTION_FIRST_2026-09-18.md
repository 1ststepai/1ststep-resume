# Action-first UX — 2026-09-18

Presentation, copy, and current-flow only. Consent, Vault authority, package truth, employer submission, and beta gates are unchanged.

## Reconciliation

Existing polish candidate `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` is already an ancestor of this branch (`7ed4e18` → `8d3ac08` → `616e450` → `a0d8c14` → `05f411f` → this successor).

| Source | Disposition |
|---|---|
| Truthful named agent states, first-class Needs You, résumé authority, trust/provenance, My Jobs operational progression, mobile/a11y | Already present in `8d3ac08`; preserved |
| One dominant Start Job Agent CTA, waitlist as fallback, Step X of 7, Saved Info as “What the Job Agent knows about you”, no forced résumé reselection, dead-end next actions, simplified extension primary | Additive action-first + landing work on the same surfaces |
| Conflicting edits | None. Later copy/CTA hierarchy is additive on the polish files |
| Unrelated dirty files | None absorbed. Owner-reviewed worktree at `b391a3f` was not touched. P2 redesign was not absorbed |

Do **not** merge this successor onto the controlled-beta release baseline. R3 `cfa483c77d22b2b6150255744865aee5583235f3` remains the security-remediation authority. After R3 independently passes, Release Validation integrates this UX candidate onto that clean lineage.

## Journey matrix

| Screen | Purpose | Primary action | Secondary | Remove / defer | Next screen |
|---|---|---|---|---|---|
| Landing | Convert to start Job Agent | Start Job Agent (email first) | Sign in; Join Early Access | Competing hero CTAs; “lead/signup” jargon | Onboarding / waitlist |
| Sign in | Restore an existing account | Sign in | Restore access | Not a second hero primary | Job Agent home |
| Guided setup | Collect the minimum to search | Continue / Start my job agent | Optional exclusions; sector filter | Full preference universe | Saved Info / search |
| Saved Info | Show what Job Agent knows | Choose a résumé or Continue to My Jobs | Edit/forget a field | Backup/export behind details | Résumé / My Jobs |
| Résumé | Choose the authoritative résumé | Use this résumé / Continue | Upload; build | Re-selecting an already chosen résumé | Path / search |
| Discovery | Show useful jobs first | Review fit / Prepare | Compare live paths | Sector filter until asked | My Jobs |
| My Jobs | Operational workspace | Verb-led next step on the card | Status tabs | Browser-helper / pipeline jargon | Prepare / Needs You / Review |
| Needs You | Resolve one blocker | Answer / Review | View My Jobs when empty | Unrelated controls around the required action | Same job, unblocked |
| Extension | Save the detected job | Save to Job Agent | Use in Resume Builder (quiet) | Dual full-width primaries; popup dashboard | Open in Job Agent |
| Empty / error | Still move the journey | Add résumé / Find jobs / Sign in | Open Job Agent | Dead-end copy | Matching next screen |

## Landing conversion (preserved)

Visitor → understands Job Agent → email/signup capture → Start Job Agent → sign-in/access. Join Early Access remains the fallback when immediate beta access is unavailable. Waitlist signup stays separate from controlled-beta entitlement (`grantsBetaAccess: false`; no `JOB_AGENT_PILOT_ALLOWED_TENANTS` writes).

## Extension (preserved)

Primary action follows current page/job state (Save to Job Agent, then Open in Job Agent). Resume Builder does not compete with Save/Open. No submission implication.

## Scorecard

ACTION-FIRST UX: PASS

SCREENS AUDITED: 12 (Landing, Sign in, Guided setup, Saved Info, Résumé, Discovery, My Jobs, Needs You, Review/source confirmation, Extension detected, Extension empty, Job Agent home)

SCREENS WITH CLEAR PRIMARY ACTION: 12/12

UNNECESSARY ACTIONS REMOVED:
- Second hero conversion CTA (Get Early Access demoted to waitlist fallback)
- Dual equal-weight landing path CTAs
- Full-width Resume Builder competing with Save in the extension
- Saved Info backup/export competing with the journey CTA
- Forced re-select of an already saved résumé during setup

OPTIONS PROGRESSIVELY DISCLOSED:
- Setup: Step X of Y; optional exclusions already in details
- Discovery sector filter behind “Filter by sector (optional)”
- Saved Info backup/export behind “Backup and export”
- Extension Resume Builder as a quiet link

DEAD ENDS REMOVED:
- Empty My Jobs → Find jobs / Adjust search
- Empty Needs You → View My Jobs
- Empty Saved Info → Add résumé / Choose a résumé
- Hero email failure still points to sales@ on 503 (unchanged)

LANDING CTA: PASS
ONBOARDING: PASS
SAVED INFO: PASS
RÉSUMÉ: PASS
DISCOVERY: PASS
MY JOBS: PASS
NEEDS YOU: PASS
EXTENSION: PASS
MOBILE: PASS (thumb-dominant guided CTA, bottom nav, full-width empty-state actions)
SECURITY/CONSENT SEMANTICS CHANGED: NO
BETA SCOPE CHANGED: NO
EXISTING UX 8d3ac08 RECONCILED: YES
UX SUCCESSOR SHA: see the commit on `cursor/job-agent-ui-ux-polish-20260917` that added this report (parent `05f411f2bc834ef9e4ef3093dafb919c20235fe7`). Durable SHA is recorded in `docs/agents/CURRENT-STATE.md` after the snapshot.
SAFE FOR RELEASE-LANE REVIEW: YES as an isolated UX inspect candidate. NO for merge onto the owner-reviewed controlled-beta baseline until R3 independently passes and Release Validation integrates it.

## Remaining P2

- Learning Center and `/app/resume` residual admin language
- GHL default landing still has a secondary waitlist CTA beside Start Job Agent
- Login/onboarding funnel events still wait on PR #86 unfreeze
