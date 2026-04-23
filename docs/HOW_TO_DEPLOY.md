# How to Deploy 1stStep.ai Resume Tailor

---

## ⚡ QUICK DEPLOY — run this every time you want to push changes

Open **PowerShell** and run this script. It clears stale git locks, commits your changes, and pushes to Vercel automatically.

```powershell
# ── Safe Push Script ────────────────────────────────────────────────────────
# Run from anywhere — this script navigates to the right folder automatically.

$repo = "C:\Users\evanp\Documents\Claude\Projects\AI-Powered Job Search Platform\resume-app"
Set-Location $repo

# 1. Clear any stale git lock files (left over from crashed git processes)
Remove-Item ".git\index.lock" -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock"  -ErrorAction SilentlyContinue
Remove-Item ".git\MERGE_HEAD" -ErrorAction SilentlyContinue

# 2. Stage all changes
git add -A

# 3. Commit (edit the message as needed)
git commit -m "update: describe your change here"

# 4. Push — Vercel auto-deploys on push
git push origin main

Write-Host "`n✅ Done — check https://app.1ststep.ai in ~60 seconds" -ForegroundColor Green
```

**That's it.** Vercel detects the push and deploys automatically. Live in ~60 seconds.

---

## ⚠️ If git push fails

**"error: cannot lock ref"** or **"Unable to create ... lock file exists"**
→ Run `Remove-Item ".git\*.lock" -ErrorAction SilentlyContinue` then retry.

**"Updates were rejected because the remote contains work you do not have"**
→ Run `git pull origin main --rebase` then `git push origin main`.

**Files not showing up in git status**
→ Make sure you're in `resume-app/`, not the parent folder. All app files live inside `resume-app/`.

---

## Initial Setup (one-time, already done)

### Vercel project is already connected
- Project: **1ststep-ai** on Vercel
- Domain: **app.1ststep.ai** → auto-deploys from `resume-app/` on every `git push origin main`
- No manual deploy steps needed — push = deploy.

### Environment Variables (already set in Vercel)
These are set in Vercel → Project → Settings → Environment Variables. Do not commit these to git.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API — resume tailoring + AI features |
| `TIER_SECRET` | Signs tier tokens for plan gating |
| `BETA_CODE` | Invite code for beta access gate |
| `GHL_API_KEY` | GoHighLevel CRM integration |
| `GHL_LOCATION_ID` | GHL location for contact capture |
| `GHL_PIPELINE_ID` | GHL pipeline for beta signups |
| `GHL_STAGE_BETA_SIGNUP` | GHL pipeline stage ID |
| `RESEND_API_KEY` | Transactional email via Resend |
| `RESEND_FROM` | Sender address — `notifications@1ststep.ai` |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature validation |
| `BETA_MODE` | `"true"` = beta gate on, `"false"` = open to all |

---

## Going Live (flip the beta gate)

When you're ready to open to all users:

1. Vercel → Project → Settings → Environment Variables
2. Change `BETA_MODE` from `true` → `false`
3. Click **Redeploy** (no code change needed)

Done — the welcome modal becomes a direct signup, no invite code required.

---

## API key setup (already done — for reference)

1. Go to https://console.anthropic.com → API Keys
2. Create key → copy it (starts with `sk-ant-api03-...`)
3. Add to Vercel env vars as `ANTHROPIC_API_KEY`

---

## Cost monitoring

Each resume tailoring run costs ~$0.06–0.18 in Anthropic credits.
Watch usage at https://console.anthropic.com → Usage

At $49/order and ~$0.15/run, margin is ~99.7%.
