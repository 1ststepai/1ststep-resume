# 1stStep.ai — Launch Plan

**Last updated:** 2026-04-12

---

## Milestone 1: Launch-Ready (current sprint)

**Goal:** Deploy a working product that non-technical customers can use without entering an API key.

### Tasks

- [x] Resume app built (index.html — 3842 lines)
- [x] Landing page built
- [x] Fulfillment workflow documented
- [ ] **Backend proxy** — Vercel serverless function that proxies Claude API calls server-side
- [ ] **Deploy to Vercel** — push both apps, set ANTHROPIC_API_KEY env var
- [ ] **Crisp live chat** — replace placeholder Website ID in landing page index.html
- [ ] **Stripe payment links** — create Essential ($49) and Complete ($99) products
- [ ] **formsubmit.co activation** — submit test form, click confirmation email
- [ ] **End-to-end test** — full customer journey from landing page to delivered resume

**Definition of done:** A non-technical person can visit the URL, submit an order, and receive a completed resume without any setup steps.

---

## Milestone 2: First 10 Customers (week 1–2 post-launch)

- [ ] Reddit posts in r/jobs, r/resumes, r/GetEmployed
- [ ] LinkedIn announcement post
- [ ] Facebook job-seeker groups
- [ ] First 5 orders at intro price ($25–$35) for social proof
- [ ] Collect testimonials and Google reviews

---

## Milestone 3: Automate Fulfillment (week 3–4)

- [ ] App self-service mode — customers use the app directly (no manual Claude.ai workflow)
- [ ] Usage tracking / cost monitoring
- [ ] Automated email delivery via n8n or Make
- [ ] Stripe webhook → trigger fulfillment

---

## Milestone 4: Scale (month 2)

- [ ] Google Ads campaign ($20–30/day on "resume writing service", "ATS resume")
- [ ] Partner outreach — career coaches, LinkedIn influencers
- [ ] Volume pricing — 3-pack, 5-pack
- [ ] Referral program

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-12 | Use Vercel for backend proxy | Matches existing deploy docs, free tier, no infra to manage |
| 2026-04-12 | Self-serve app as primary product (not manual fulfillment) | Scales without Evan's time per order |
