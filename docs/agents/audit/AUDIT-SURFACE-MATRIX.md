# Independent audit surface matrix

These are **audit tracks**, not claims that a dated source is currently deployed. Verify aliases, commit, artifact, and runtime before updating evidence. `Last audited` is independent of development QA. The consulting site `1ststep.ai` is excluded.

| Track | Source | Live target | Current evidence lead | Last audited commit/date | Status | Outstanding verification |
| --- | --- | --- | --- | --- | --- | --- |
| `resume.1ststep.ai` | `resume-tailor-landing/standalone/` | Public Vercel résumé landing | Dated architecture identifies a static site; verify current deployment/copy. | NONE / NEVER | NOT AUDITED | Source/alias parity, navigation, claims, privacy. |
| `app.1ststep.ai` | Root static client, `client/`, `api/` | Vercel `1ststep-resume` Production | Dated public HTTP and candidate checks; signed path unproven. | NONE / NEVER | NOT AUDITED | Current production identity; signed end-to-end flow and claims. |
| `partners.1ststep.ai` | `partners-landing/`; app-side role source UNKNOWN — locate on exact candidate | Public partner landing; app-side role target to verify | Candidate role tests are not deployed isolation proof. | NONE / NEVER | NOT AUDITED | Live role, consent/admin boundary, claims. |
| Chrome extension | `1ststep-extension/` | Chrome Web Store and installed package | Candidate/published versions diverged in dated reports. | NONE / NEVER | NOT AUDITED | Store/installed version, digest, permissions, bridge. |
| APIs/workers | `api/`, `lib/`, `vercel.json` | App Vercel functions and scheduled workers | Static gates do not prove protected runtime readiness. | NONE / NEVER | NOT AUDITED | Exact deployed code, worker/queue, failure and receipt paths. |
| Clerk/session | `login.*`, `api/user-session.js`, session libraries | Clerk instance plus app Preview/Production | Preview readiness changed; complete browser/session proof unavailable. | NONE / NEVER | NOT AUDITED | Instance/domain, exchange, cookie, denial, logout, second login. |
| Redis/Postgres | Store libraries, `migrations/`, `supabase/` | Configured isolated/hosted data plane | Source schemas and local tests do not prove hosted RLS or durability. | NONE / NEVER | NOT AUDITED | Two-tenant denial, cross-session readback, lifecycle, restore. |
