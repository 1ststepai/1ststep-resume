# Deployment Instructions
### Get your landing page live in 10 minutes — free

---

## Option A: Vercel (Recommended — free, fastest)

This puts your page at a URL like `resume-tailor.vercel.app` and lets you connect
your `resume.1ststep.ai` subdomain for free.

### Steps:

1. **Create a free Vercel account** at vercel.com

2. **Upload your files:**
   - Go to vercel.com/new
   - Drag and drop the `resume-tailor-landing` folder
   - Vercel detects it as a static site automatically
   - Click Deploy → it's live in ~30 seconds

3. **Get your live URL:**
   - Vercel gives you a URL like `resume-tailor-landing.vercel.app`
   - You can use this immediately to start taking orders

4. **Connect your subdomain (resume.1ststep.ai):**
   - In Vercel dashboard → your project → Settings → Domains
   - Add `resume.1ststep.ai`
   - Vercel shows you the DNS records to add
   - Go to wherever 1ststep.ai's DNS is managed (GoDaddy, Cloudflare, Namecheap, etc.)
   - Add a CNAME record: `resume` → `cname.vercel-dns.com`
   - Takes 5-30 minutes to propagate
   - Done — resume.1ststep.ai is now your landing page

---

## Option B: Netlify (also free, also works great)

Same as Vercel. Go to netlify.com → drag and drop the folder → live in 30 seconds.
Subdomain connection works the same way.

---

## Option C: GitHub Pages (free, slightly more steps)

1. Create a free GitHub account at github.com
2. Create a new repository called `resume-tailor`
3. Upload `index.html` to the repo
4. Go to Settings → Pages → Source: main branch
5. Site is live at `yourusername.github.io/resume-tailor`
6. Custom subdomain: add a CNAME file to the repo with `resume.1ststep.ai`
   and add the CNAME DNS record at your domain registrar

---

## Set Up the Form (formsubmit.co)

The landing page already uses formsubmit.co — a free service that emails you
form submissions. No backend needed.

**One-time activation:**
1. The first time someone submits the form, formsubmit.co sends a confirmation
   email to evan@1ststep.ai
2. Click the confirmation link — that's it, the form is activated
3. All future submissions go directly to your email with the attached resume

**Test it yourself first:**
- Go to your live page
- Fill out the form with your own resume and a test job description
- Submit → you'll get the confirmation email
- Click the link → form is active

---

## Set Up Stripe for Payments (15 min, free)

You'll want this before you start marketing. Clients paying by card is much
smoother than PayPal/Venmo.

1. **Create a Stripe account** at stripe.com (free, no monthly fees)
2. **Create two Payment Links:**
   - Products → Add Product → "Essential Resume Tailoring" → $49
   - Products → Add Product → "Complete Resume Package" → $99
   - For each: Payment Links → Create Link
3. **Copy the payment link URLs**
4. **Update the landing page buttons:**
   Open `index.html`, find `href="#order"` on the pricing buttons and replace
   with your Stripe payment link URLs

**Collect info at checkout:**
In Stripe's Payment Link settings → After payment → Collect customer info
Add a custom field: "Paste your job posting URL here"

Then use the formsubmit.co form for the full intake (resume upload + full JD).

**Simple flow:**
1. Customer fills intake form (resume + job description)
2. You receive it, reply with payment link
3. They pay → Stripe emails you confirmation
4. You do the work and deliver

---

## Create a Thank You Page (optional but professional)

Create a second file: `thank-you.html`

Content:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Order Received — 1stStep.ai</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 80px 20px; }
    h1 { font-size: 36px; color: #111827; }
    p { font-size: 18px; color: #6B7280; max-width: 480px; margin: 16px auto; }
  </style>
</head>
<body>
  <h1>✅ Order Received!</h1>
  <p>Thank you! I'll email you within 1 hour to confirm and you'll have
  your tailored resume within 24 hours.</p>
  <p style="font-size:14px">Questions? Email <a href="mailto:evan@1ststep.ai">evan@1ststep.ai</a></p>
</body>
</html>
```

Upload this to the same folder so it lives at `resume.1ststep.ai/thank-you`

---

## Where to Post to Get First Customers (Day 1-7)

**Free, high-intent:**

1. **Reddit** — Post in: r/jobs, r/resumes, r/GetEmployed, r/cscareerquestions
   Don't spam. Provide value first (answer questions about resumes, ATS, etc.)
   then mention your service when relevant.

   Sample post for r/resumes:
   > "I built a done-for-you resume tailoring service — share your experience"
   > Tell the real story of why you built it, what problem it solves.
   > Offer the first 5 people a discounted rate ($25 intro price) for feedback.

2. **LinkedIn** — Post your story:
   > "I was frustrated watching friends apply to 200 jobs and hear nothing.
   > The problem isn't them. It's their resume not matching the ATS keywords.
   > So I built a done-for-you tailoring service. First 10 orders at intro pricing."

3. **Facebook Groups** — Search: "job search support", "laid off [city]",
   "career change 2026". These groups are full of active job seekers.

4. **Twitter/X** — Same story angle. Job search content gets organic reach.

5. **Career coaching communities** — Find career coaches on LinkedIn and offer
   a white-label partnership: they refer clients, you split revenue (70/30).

**Paid (when you're ready):**
- Google Ads targeting "resume writing service" and "ATS resume" — high intent,
  affordable at $20-30/day
- Reddit Ads on r/jobs are surprisingly cheap and targeted

---

## Tracking Your First 30 Days

Keep a simple spreadsheet:

| Date | Source | Name | Package | Paid? | Delivered? | Feedback |
|------|--------|------|---------|-------|------------|----------|

Goal: 10 paid orders in 30 days = $490–$990 revenue.
That's your proof of concept. Screenshot everything positive for investor conversations.
