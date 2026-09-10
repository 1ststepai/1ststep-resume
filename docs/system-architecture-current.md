# Current system architecture

Audit snapshot: 2026-09-08. Repository evidence is from `main` at `cb8da3c`; live behavior was checked separately because production changed during the audit.

## System map

```mermaid
flowchart LR
  U[Applicant] --> WEB[app.1ststep.ai static web]
  U --> EXT[Chrome extension]
  WEB --> LEGACY[/app/resume legacy workspace]
  WEB --> AGENT[/app and /concierge Job Agent]
  WEB --> AUTH[Clerk plus legacy access migration]
  AGENT --> API[Vercel serverless APIs]
  LEGACY --> API
  EXT -->|capture acknowledgement and signed handoff| API
  API --> REDIS[Upstash Redis encrypted runtime]
  API --> PG[Postgres canonical schema]
  API --> OBJ[Private artifact storage boundary]
  API --> ATS[Public ATS feeds]
  ATS --> GH[Greenhouse]
  ATS --> LEV[Lever]
  ATS --> ASH[Ashby]
  ATS --> SR[SmartRecruiters]
  API --> AI[AI routing layer]
  AI --> CF[Cloudflare AI]
  AI --> OAI[OpenAI-compatible]
  AI --> ANT[Anthropic]
  AI --> DS[DeepSeek, routine-only if approved]
  API --> WORKER[Twice-daily recovery/background worker]
  WORKER --> REDIS
  API -. disabled by default .-> BROWSER[Remote employer-browser provider]
  EXT -->|controlled, reviewed fields| GHFORM[Greenhouse form]
  GHFORM -->|user submits| EMP[Employer]
  EMP -->|independent receipt evidence| RECEIPT[Receipt worker/API]
  RECEIPT --> API
```

## Deployable repository and surfaces

- Canonical deployable repository: `1ststep-resume` (`https://github.com/1ststepai/1ststep-resume.git`).
- Vercel output is built by `build-public-web.mjs` into `.public-web`.
- Primary routes: `/`, `/app` and `/concierge` -> `concierge.html`; `/app/resume` -> `app.html`; `/funnel` -> `funnel.html`.
- Frontend is large-file vanilla JavaScript: `app.js` is about 9,306 lines/457 KB and `concierge.js` about 4,911 lines/339 KB. This makes ownership, testing, and safe migration harder.
- There are 40+ serverless API routes and roughly 100 domain/storage/control modules under `lib/`.

## Current data ownership

| Data | Current authoritative location | Secondary/legacy location | Finding |
| --- | --- | --- | --- |
| Signed Job Agent run/session | Encrypted Upstash Redis runtime | tab storage identifiers | Durable but 30-day runtime retention is not a complete historical system |
| Confirmed applicant facts/documents | Encrypted applicant vault after explicit opt-in | legacy `localStorage`/`sessionStorage` | Split source of truth during migration |
| Legacy resume, profile, tracker, tailoring history | browser storage | JSON backup | Not cross-device or authoritative |
| Application session and receipts | encrypted server-side session/receipt stores | legacy tracker labels | Receipt-backed server state is authoritative; imported `applied` is not |
| Canonical relational model | Postgres migration defines 20 RLS tables | Redis runtime | Verified in isolated Neon staging evidence; production migration/use is unknown |
| Generated artifacts | encrypted run envelope and optional private object-storage boundary | browser download | Production object-storage lifecycle remains unverified |
| Extension captures | memory/short-lived extension storage until exact acknowledgement | none | Intentionally transient; captured job is unverified until reviewed |

## Runtime contracts that are already valuable

- Tenant partitioning, AES-256-GCM envelopes, idempotency, leases, bounded retry, circuit breakers, spend reservation, audit chains, and outcome-unknown handling.
- Deterministic discovery and hard filtering precede model calls.
- Direct public ATS discovery supports Greenhouse, Lever, Ashby, and SmartRecruiters across a checked-in employer catalog.
- Package generation preserves source maps and blocks unsupported claims.
- Application state separates fill, submission attempt, receipt verification, and authoritative Submitted.
- Human gates remain for passwords, OTPs, CAPTCHA, attestations, unknown facts, personal-data transmission, and final submission.

## Confirmed current limitations

- Production-safe behavior is discovery/preparation, not autonomous submission.
- Extension source is version 1.4.0; the Chrome Web Store showed 1.3.2 during this audit.
- User-triggered capture is broad through `activeTab`, but controlled form filling is only for standard hosted Greenhouse.
- The remote employer-browser provider and isolated document-render path are disabled by default and require separate cost/security approvals.
- The twice-daily cron is a wake-up/recovery cadence, not a continuous scalable queue consumer.
- Live public health returned healthy/ready, but protected dependency, worker, and deep readiness evidence was inaccessible and is therefore unknown.
- Source-to-live asset parity failed for the clean audit checkout; production was changing during the audit. Code and live claims are kept separate throughout these documents.

## Security boundaries

- Opaque `Secure`, `HttpOnly`, host-only Job Agent cookie; legacy bearer support remains for migration.
- Receipt ingestion is service-to-service and HMAC authenticated.
- Candidate values must not enter extension storage, logs, cost telemetry, or shared public indexes.
- RLS policies and backend-only grants exist in the canonical Postgres migration.
- Remaining risks: split legacy state, very large client files, migration status unknown in production, broad legacy CSP/CDN dependencies on `/app/resume`, and incomplete production recovery/object-storage evidence.
