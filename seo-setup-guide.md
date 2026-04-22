# 1stStep.ai — SEO Setup Guide

---

## 1. GHL Landing Page — Update These in Page Settings

In GHL, go to **Funnels → your funnel → Page Settings (gear icon) → SEO Meta Data**.

Enter the following:

**Page Title:**
```
AI Resume Tailor for Job Seekers | 1stStep.ai
```

**Meta Description:**
```
Tailor your resume to any job in 60 seconds. 1stStep.ai uses AI to match your resume to the job description, close keyword gaps, and beat the ATS. Free to start.
```

**OG Image:** Upload a 1200×630px branded image (dark background, logo, tagline). This shows when the link is shared on LinkedIn, Slack, iMessage, etc. Worth making — it significantly increases click-through on shared links.

**Page URL Slug:** If you haven't already, change `/home-page-438820` to something clean like `/` (root) or `/home`. The current slug looks auto-generated and won't rank well.

---

## 2. Google Search Console — Verify Your Site

Google Search Console tells you how your site appears in search results, which keywords you're ranking for, and flags any indexing issues.

**Steps:**
1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Click **Add Property** → choose **Domain** (not URL prefix — Domain covers all subdomains)
3. Enter `1ststep.ai`
4. Google will give you a **DNS TXT record** to add — copy it
5. Log into your DNS provider (HostGator based on your open tabs) → go to DNS settings for `1ststep.ai`
6. Add a new **TXT record** with the value Google gave you
7. Back in Search Console, click **Verify** — can take a few minutes to propagate

**After verifying:**
- Submit your sitemap (see below)
- Check the Coverage report to make sure pages are being indexed
- The landing page URL is what you want Google indexing — the app is now set to `noindex` so it won't compete

**Sitemap:** Your GHL funnel should auto-generate one at `https://1ststep.ai/sitemap.xml` — check if that URL returns anything. If not, you can manually submit just the landing page URL in Search Console under **Sitemaps → Add a new sitemap** → enter the URL directly.

---

## 3. Google Business Profile — Claim Your Brand Listing

Even for a SaaS, having a Google Business Profile means when someone searches "1stStep.ai" they see your official info panel on the right side of search results — logo, description, links, reviews. Builds trust immediately.

**Steps:**
1. Go to [business.google.com](https://business.google.com)
2. Click **Manage now** → search for `1stStep.ai`
3. If it doesn't exist, click **Add your business**
4. Business name: `1stStep.ai`
5. Category: **Software Company** (or "Internet Company")
6. Website: `https://1ststep.ai`
7. For address: you can list it as a service-area business (no physical address shown) — just choose your general region
8. Verify via postcard or phone

**What to fill in once verified:**
- **Description:** "1stStep.ai is an AI-powered resume tailoring and job search platform. Paste your resume and any job description — our AI rewrites your resume to match the role's keywords and beat ATS filters in under 60 seconds."
- **Website:** `https://1ststep.ai`
- **Products:** Add Essential and Complete plans as products with descriptions and pricing
- **Photos:** Upload your logo and a screenshot of the app

---

## Summary — What You Do vs. What's Already Done

| Task | Status |
|---|---|
| App canonical URL fixed to `app.1ststep.ai` | ✅ Done |
| App set to `noindex` (keeps Google focused on landing page) | ✅ Done |
| GHL page title & meta description | ⚡ You update in GHL page settings |
| GHL page slug (change from `/home-page-438820`) | ⚡ You update in GHL |
| OG image (1200×630px) | ⚡ You create and upload |
| Google Search Console — DNS verification | ⚡ You add TXT record in HostGator |
| Google Search Console — sitemap submission | ⚡ After DNS verified |
| Google Business Profile | ⚡ You claim at business.google.com |
