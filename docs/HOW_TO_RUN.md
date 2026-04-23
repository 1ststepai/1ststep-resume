# How to Run 1stStep.ai Resume Tailor
### Two options: run locally right now, or put it online in 5 minutes

---

## Option 1: Open it locally RIGHT NOW (zero setup)

1. Find the file `index.html` in this folder
2. Double-click it — it opens in your browser
3. Click "Set API Key" in the top right
4. Paste your Claude API key (from console.anthropic.com → API Keys)
5. That's it — start tailoring resumes

Your API key is saved in your browser. You won't need to enter it again.

---

## Option 2: Put it online (Vercel — free, 5 minutes)

This gives you a real URL like `resume.1ststep.ai` you can share with paying customers.

### Step 1: Go to vercel.com
- Click "Sign Up" → sign up with GitHub (or Google)
- It's free, no credit card needed

### Step 2: Deploy the app
- On your Vercel dashboard, click "Add New Project"
- Choose "Browse" or drag-and-drop the `resume-app` folder
- Vercel detects it automatically
- Click **Deploy** — takes about 30 seconds
- You get a URL like `resume-app-xyz.vercel.app` — the app is live

### Step 3: Connect your subdomain (optional)
- In Vercel: go to your project → Settings → Domains
- Type `resume.1ststep.ai` and click Add
- Vercel shows you a CNAME record to add
- Go to wherever you manage 1ststep.ai DNS (GoDaddy / Cloudflare / etc.)
- Add: Type=CNAME, Name=resume, Value=cname.vercel-dns.com
- Wait 10 minutes → resume.1ststep.ai is live

---

## How to use it

1. **Set your API key** (top right corner, one time only)
2. **Upload or paste your resume** — .txt files work best, or just paste the text
3. **Paste the job description** — the full text from the job posting
4. **Add context** (optional) — e.g. "I'm switching industries" or "senior candidate"
5. **Choose Essential or Complete** — Complete adds a cover letter
6. **Click "Tailor My Resume"** — takes 20-45 seconds
7. **Review the 4 tabs:**
   - 📄 Tailored Resume — your rewritten resume, ready to copy/download
   - 🔍 Keywords — what matched, what's missing, ATS score estimate
   - 📝 What Changed — plain-English explanation of every edit
   - ✉️ Cover Letter — (Complete mode only)
8. **Copy or download** — use the buttons in the top right of the results panel

---

## What each stage does (so you understand what's happening)

| Stage | Model Used | What It Does |
|-------|-----------|--------------|
| Keyword Extraction | Claude Haiku (fast) | Pulls required skills, tools, qualifications from the JD |
| Gap Analysis | Claude Haiku (fast) | Compares your resume to the extracted requirements |
| Resume Rewrite | Claude Sonnet (quality) | Rewrites bullets, summary, skills section — no fabrication |
| ATS Check | Browser (instant) | Checks for formatting issues |
| Cover Letter | Claude Sonnet | Writes a tailored cover letter (Complete mode only) |

---

## Cost per tailoring

- Essential (no cover letter): ~$0.06–0.10 in API credits
- Complete (with cover letter): ~$0.12–0.18 in API credits

At $49–$99 per customer order, your margin is essentially 100%.

---

## Troubleshooting

**"API error 401"** → Your API key is wrong or expired. Get a new one at console.anthropic.com

**"API error 429"** → You've hit rate limits. Wait 30 seconds and try again.

**"API error 529"** → Anthropic is overloaded. Try again in a minute.

**File upload didn't work / extracted garbled text** → Use paste instead. PDF text extraction is limited without a backend. For customer orders, ask them to paste their resume text.

**Results look generic** → Make sure the full job description is pasted (not just the title). The more complete the JD, the better the output.
