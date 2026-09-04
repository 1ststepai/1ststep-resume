# Zero-cost Application Concierge beta

This slice keeps the existing 1stStep self-service tools and adds two replaceable server-side capabilities to the simple concierge chat.

## What works locally

- The chat turns a plain-language request into a saved mission.
- Once a resume and the required mission fields exist, the concierge calls `/api/concierge-discovery`.
- Discovery reads a built-in launch catalog of 37 verified public Greenhouse, Lever, Ashby, and SmartRecruiters employer feeds, normalizes results, applies role-title, salary, work-setting, employment-type, and location filters, and deduplicates them before adding `Found` records. SmartRecruiters uses bounded mission-title queries so relevant jobs on very large boards are not limited to the first 100 general postings. An environment-provided catalog can replace the default.
- A single mission can combine remote, hybrid, and on-site preferences with full-time, part-time, contract, temporary, internship, or seasonal work.
- The concierge calls `/api/ai` for proactive guidance, career-story extraction, and master-resume writing. The route can use Cloudflare Workers AI, an OpenAI-compatible endpoint, or Anthropic without changing the browser code.
- If no hosted model is configured, deterministic local guidance and the saved workspace remain usable.
- External employer submission is disabled. A role is never marked Submitted without authoritative receipt evidence.

## Server configuration

`CONCIERGE_PUBLIC_ATS_SOURCES` is an optional JSON array of employer job-board sources. If omitted, the reviewed launch catalog in `lib/public-ats-catalog.js` is used. Set it to `[]` only to deliberately disable feed discovery. Example structure:

```json
[
  { "provider": "greenhouse", "slug": "employer-board-token", "employer": "Employer name" },
  { "provider": "lever", "slug": "employer-site", "employer": "Employer name" },
  { "provider": "ashby", "slug": "employer-board-name", "employer": "Employer name" }
]
```

The AI route selects the first configured option unless `AI_PROVIDER` explicitly chooses `cloudflare`, `openai-compatible`, or `anthropic`. Model names can be overridden with `AI_FAST_MODEL` and `AI_QUALITY_MODEL`; an OpenAI-compatible base URL can be set with `AI_BASE_URL`.

Credentials stay server-side. No password, OTP, CAPTCHA response, resume body, or prompt content is written to the AI route's logs. Production provider routes use Redis-backed account, IP, route, and cost budgets and fail closed if durable metering is unavailable.

## Deliberate limits

- This is public-ATS feed discovery, not universal web search. LinkedIn, Indeed, ZipRecruiter, Monster, and employer pages that lack supported feeds remain search links or browser-extension-assisted sources. The agent reports the exact number found instead of padding a requested target.
- Direct-page eligibility verification and employer-portal duplicate checks are not yet automated.
- The managed employer browser is a labeled simulation; no live form transmission occurs.
- Production deployment, tenant-isolated cloud storage, durable queues, and real submission orchestration remain separate approval gates.

## Visual fidelity ledger

Accepted concept: `docs/design/simple-job-agent-concept.png`

Latest implementation evidence: `docs/qa/zero-cost-concierge-desktop.png` and `docs/qa/zero-cost-concierge-mobile.png`

1. The large single-question hero remains the primary focus on desktop and mobile.
2. Upload resume and Build mine remain equal, one-click onboarding paths directly below the promise.
3. The plain-language mission box and one dominant Start button preserve the few-click launch flow.
4. Applications and Activity stay in the quiet top navigation; advanced operating controls remain secondary.
5. The conversation sits directly below the launch form and preserves one-question follow-up behavior.
6. The dark navy surface, restrained blue emphasis, compact typography, and centered desktop composition match the accepted visual direction.

Copy difference: the implementation says "Your job-search agent" and provides truthful readiness guidance instead of the concept's pre-scripted success conversation. This reflects live state and avoids implying that a search or application happened when it did not.

Known deviation: the concept shows progress counters at the top of the mobile conversation. The implementation reveals those counters only after a mission exists, keeping first-run onboarding shorter.
