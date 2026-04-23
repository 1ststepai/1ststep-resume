# ROADMAP.md — 1stStep.ai
> Single source of truth for what's built, what's next, and what's been cut.
> Aider: read this before starting any task. Do not build anything in FUTURE without explicit instruction. Do not re-build anything marked RETIRED.

---

## ✅ SHIPPED — Do Not Rebuild

| Feature | Notes |
|---|---|
| Resume tailoring (ATS + DOCX download) | Free: 3x Haiku lifetime · Complete: unlimited Sonnet |
| Cover letter generation | Complete tier only |
| Application tracker | With status + follow-up dates |
| Interview Cheat Sheet v2 | Complete tier only |
| LinkedIn OAuth sign-in | Profile auto-fill on signup |
| LinkedIn PDF import | Resume import via PDF.js — keep |
| GHL CRM integration | Contacts, tags, pipeline stages |
| Beta email blast infra | health.js — blast + backfill actions |
| Application event tracking | track-event.js — fires GHL tags on milestones |
| Stripe payment + tierToken | HMAC signed, 20 min TTL, no per-call Stripe hits |
| Stripe webhook handling | checkout.session.completed + subscription events |

---

## ✕ RETIRED — Do Not Touch or Rebuild

| Feature | Why cut |
|---|---|
| Job Search (Adzuna + Indeed) | Fragile scraper, not core value prop. Replace jobs.js with URL/paste JD input |
| Bulk Apply | Undermines brand, no retention value, Wrong product direction |
| Essential tier ($49/mo) | Collapsed to Free / Complete only. Map existing Essential users → Complete |

---

## 🔴 FIX FIRST — In Priority Order

These block the next phase of the product. Complete in order.

### 1. Retire jobs.js + free the Vercel slot
- Remove job search tab from UI
- Delete `api/jobs.js`
- Replace with URL/paste JD input field
- Remove `ADZUNA_API_KEY` env var
- **Why now:** Frees 1 of 12 Vercel function slots. Nothing else can be built without this.
- **See:** BUG-001, BUG-002

### 2. Collapse Essential tier → Free/Complete
- Remove `essential` branch from `subscription.js` and `claude.js`
- Map existing Essential subscribers to Complete
- Remove Essential from all UI tier checks
- Archive (don't delete) Essential Stripe product
- **See:** BUG-004

### 3. Remove Bulk Apply from nav + codebase
- Remove from nav
- Delete `bulk_apply` callType from `claude.js`
- Remove any Bulk Apply UI components
- **See:** BUG-008

### 4. Fix landing page pricing + copy
- Full checklist in BUG-009
- Update pricing cards, hero CTA, Stripe links, FAQs
- Add SEO/OG meta tags (BUG-010)
- **Why now:** Landing page is live and showing wrong prices. Every visitor sees broken pricing.

### 5. Add localStorage → Supabase cloud backup
- Email-keyed sync, localStorage remains primary
- Unblocks: multi-device, data recovery, Chrome Extension profile sync
- **See:** BUG-003, EXT-BUG-001

---

## 🟡 NEXT — After Fixes Are Done

These are the next features to build, in priority order.

### Nav restructure
- Demote LinkedIn optimizer out of main nav → "More Tools"
- Reclaim slot for "Backup / Sync" status indicator
- Keep LinkedIn OAuth and PDF import — just move the optimizer

### Auto-create tracker entry on tailor
- When user completes a tailor, auto-add to application tracker with job title + company pre-filled
- Zero-friction path to 5+ saved applications = primary retention hook

### Rate limiting on claude.js
- Upstash Redis sliding window
- Free: 3 lifetime tailors (already enforced via tierToken, add IP guard)
- Complete: 50 calls/hour soft cap, 200/day hard cap
- **See:** BUG-005

### UX: Loading states + error boundaries
- Add "warming up…" message for first 3s of any AI call
- Add retry UI on AI call failure
- **See:** BUG-006, BUG-007

### Split index.html — Phase 1
- Extract `tracker.js` (application tracker)
- Extract `auth.js` (LinkedIn OAuth + session)
- One module per PR — do not attempt a full rewrite
- **See:** BUG-012

---

## ◈ FUTURE — Do Not Start Without Explicit Instruction

These are planned but not yet scoped. Do not begin any of these unless explicitly told to.

| Feature | Notes |
|---|---|
| AI Career Chat | Complete tier · Sonnet · 2k token/day cap · resume+JD as system context |
| Chrome Extension — 1-click apply | Greenhouse + Lever first, then LinkedIn. Blocked by EXT-BUG-001 until Supabase sync is done |
| Interview Prep — promote | Surface more prominently in UI. High-intent repeat visit driver |
| Notification engine | Follow-up nudges, application decay alerts. Requires cloud persistence |
| Market Relevancy Score | Resume vs. current job market. Complete tier upsell hook |
| Multi-device sync | Requires Supabase cloud backup first |
| Streaming AI responses | Better UX for long tailoring calls. Add token budget guard first |
| Stripe trial period | 7-day `trial_period_days` in Checkout. Send day-5 reminder via GHL/Resend |

---

## Chrome Extension — Separate Track

The extension is a future feature, not the current sprint. It has its own dependency chain.

### Extension build order (when ready):
1. **Supabase cloud sync first** — extension cannot read localStorage from app.1ststep.ai (different origin). Without cloud sync, there's no resume to autofill with.
2. **"Copy to Extension" bridge** — button in web app writes profile to `chrome.storage` via deep link. Temporary workaround until Supabase is live.
3. **Greenhouse + Lever content scripts first** — stable selectors, predictable HTML, high ROI
4. **Popup + Side Panel UI** — toolbar popup + Chrome Side Panel API (MV3, Chrome 114+)
5. **autofill callType in claude.js** — returns structured JSON for form fields. Add via `?action=` param (no new Vercel function)
6. **GHL extension tags** — `extension_install`, `extension_apply`, `extension_autofill` in `track-event.js`
7. **LinkedIn Easy Apply** — after Greenhouse/Lever are solid
8. **Workday** — last, hardest (Shadow DOM)

### Extension file structure (reference):
```
1ststep-extension/
├── manifest.json         # MV3
├── background.js         # Service worker — auth token, message routing
├── content.js            # Shared detector — fires on all matched URLs
├── popup.html/js         # Toolbar popup
├── sidepanel.html/js     # Chrome Side Panel API
├── sites/
│   ├── greenhouse.js     # Start here — stable selectors
│   ├── lever.js          # Start here — stable selectors
│   ├── linkedin.js       # Multi-step modal — selectors change often
│   ├── indeed.js         # iframe-based, cross-frame messaging needed
│   └── workday.js        # ⚠ Shadow DOM — hardest, do last
└── utils/
    ├── auth.js           # tierToken fetch + cache in chrome.storage
    └── filler.js         # Generic field fill (input, select, textarea, file)
```

---

## API Function Slots — Track Carefully

**Current: 12/12 on Vercel Hobby. AT LIMIT.**

| File | Purpose | Slot |
|---|---|---|
| claude.js | AI proxy — tailor, cover_letter, interview, utility, chat | ✅ keep |
| jobs.js | ⚠ RETIRING — replace with paste/URL input | 🗑 free this slot |
| subscription.js | Stripe tier lookup + LinkedIn OAuth | ✅ keep |
| health.js | Admin/cron — email blasts + GHL backfill | ✅ keep |
| notify-signup.js | New user signup → GHL + welcome email | ✅ keep |
| track-event.js | CRM event tagging | ✅ keep |
| ghl-stage.js | GHL pipeline stage updates | ✅ keep |
| stripe-webhook.js | Stripe subscription events | ✅ keep |
| tally-webhook.js | Tally form submissions (beta) | ✅ keep |
| beta.js | Beta access management | ✅ keep |
| beta-expiry-check.js | Daily cron — expire beta users | ✅ keep (consolidate with beta.js later) |
| app-config.js | Feature flags + tier limits to frontend | ✅ keep |
| _alert.js | Resend alert helper — NOT a route (underscore prefix) | exempt |

**Rule:** Add new functionality via `?action=` params on existing files. Never create a new `/api/*.js` file without retiring one first.

---

## AI Visibility / Growth Track (Separate from Engineering)

Not engineering tasks — tracked here for completeness.

### Week 1 (free, fast):
- [ ] Create G2 vendor profile — fill every field
- [ ] Create Capterra listing
- [ ] Create Trustpilot business profile
- [ ] Launch on Product Hunt
- [ ] Add `Organization` + `Product` + `FAQPage` schema to landing page
- [ ] Create `/llms.txt` at site root listing key pages
- [ ] Add OG / Twitter card meta tags
- [ ] Standardise brand name: always "1stStep.ai" everywhere

### Week 2–3:
- [ ] Email 5 "best AI resume builder" roundup authors for inclusion
- [ ] Post helpful answers in r/resumes + r/jobs (no spam)
- [ ] Answer 3+ Quora questions about resume tailoring
- [ ] Write first blog post: "How to tailor a resume for ATS in 2025"
- [ ] Create "1stStep.ai vs Teal" comparison page

### Month 2:
- [ ] GHL day-7 review request email to all users
- [ ] Target: 25 reviews across G2 + Trustpilot + Capterra
- [ ] Display review count + star rating on landing page with Review schema
- [ ] Record 1 YouTube walkthrough (real resume, real result)
- [ ] Submit to AlternativeTo, SaaSHub, Slant
