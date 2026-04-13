# How to Deploy 1stStep.ai Resume Tailor
### With server-side API key (no customer setup required)

This is the production deployment. Customers visit the URL and use the app
immediately — no API key needed on their end.

---

## Step 1: Get your Anthropic API key

1. Go to https://console.anthropic.com → API Keys
2. Click "Create Key"
3. Copy it — it starts with `sk-ant-api03-...`
4. Keep it secret — don't share it or commit it to git

---

## Step 2: Deploy to Vercel

### Option A: Drag and Drop (easiest, no account linking needed)

1. Go to https://vercel.com and sign in (or create a free account)
2. Click "Add New Project"
3. Click "Browse" and select the `resume-app` folder
4. Before clicking Deploy, click **"Environment Variables"** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-your-key-here`
5. Click **Deploy** — takes about 60 seconds
6. You get a URL like `resume-app-xyz.vercel.app`

### Option B: Vercel CLI (for future updates)

```bash
npm install -g vercel
cd resume-app
vercel --prod
```

Set the env var once:
```bash
vercel env add ANTHROPIC_API_KEY
```
Paste your key when prompted.

---

## Step 3: Test it

1. Visit your Vercel URL
2. Paste a sample resume in the Resume box
3. Paste a job description in the Job Description box
4. Click "Tailor My Resume"
5. Should work in ~30 seconds — no API key prompt, no setup

---

## Step 4: Connect your domain (optional)

1. In Vercel → your project → Settings → Domains
2. Type `resume.1ststep.ai` and click Add
3. Add a CNAME record at your DNS provider:
   - Name: `resume`
   - Value: `cname.vercel-dns.com`
4. Wait 10 minutes → resume.1ststep.ai is live

---

## Updating the app

When you make changes to `index.html` or `api/claude.js`:
- Drag the `resume-app` folder to Vercel again (it overwrites the old deployment)
- Or use `vercel --prod` from the command line

---

## Cost monitoring

Each resume tailoring run costs ~$0.06–0.18 in Anthropic credits.
Watch your usage at https://console.anthropic.com → Usage

At $49/order and $0.15/run in API costs, your margin is ~99.7%.
