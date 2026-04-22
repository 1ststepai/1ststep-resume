# Resume Tailoring Fulfillment Workflow
### 1stStep.ai — Done-For-You Service
### Time to fulfill one order: ~20–35 minutes

---

## When an order arrives (email from formsubmit.co)

You'll get an email with:
- Customer name + email
- Package selected (Essential $49 / Complete $99)
- Job description (pasted in form)
- Their current resume (attached)
- Any notes they left

**Reply immediately** (within 1 hour, any time of day):

> Hi [Name], I received your order and I'm working on your tailored resume now.
> You'll have it in your inbox within 24 hours. I'll reach out if I have any questions.
> — Evan, 1stStep.ai

---

## Step 1: Invoice / Collect Payment (do this first)

**Option A — Stripe Payment Link (recommended):**
1. Go to dashboard.stripe.com → Payment Links
2. Create two products: "Essential $49" and "Complete $99"
3. Send them the payment link in your reply email
4. Don't start work until payment is confirmed (Stripe will email you)

**Option B — Quick start while setting up Stripe:**
- Send a PayPal.me link or Venmo request for the amount
- Start work once you see the payment

---

## Step 2: Run the AI Resume Tailoring

Open Claude at claude.ai. Use the prompts below in order.

---

### PROMPT 1 — Extract Keywords from Job Description

Paste this exactly, replacing [JOB DESCRIPTION]:

```
You are an expert ATS (Applicant Tracking System) analyst.

Analyze the following job description and extract:
1. REQUIRED skills and qualifications (explicitly stated as required/must-have)
2. PREFERRED skills (nice-to-have, preferred, or bonus)
3. Key tools and technologies mentioned
4. Important action verbs used in the role description
5. Any certifications or degrees required
6. The seniority level and primary responsibilities

Format as a structured JSON response.

JOB DESCRIPTION:
[PASTE FULL JOB DESCRIPTION HERE]
```

**Save the output.** You'll use it in the next prompt.

---

### PROMPT 2 — Gap Analysis

```
I have a job seeker's resume and a list of keywords required for a specific role.

REQUIRED KEYWORDS FROM JOB DESCRIPTION:
[PASTE OUTPUT FROM PROMPT 1]

CANDIDATE'S CURRENT RESUME:
[PASTE THE TEXT OF THEIR RESUME — copy/paste from the PDF or Word doc]

Please analyze:
1. Which required keywords are PRESENT in their resume (exact or semantic match)?
2. Which required keywords are MISSING from their resume?
3. Which preferred keywords are present?
4. Which preferred keywords are missing?
5. What is the current match percentage (rough estimate)?

Be specific and reference where in their resume each keyword appears or is absent.
```

**Save the output.** Review it — this tells you what needs to change.

---

### PROMPT 3 — Generate Tailored Resume

This is the main prompt. Replace all [BRACKETS] with real content:

```
You are an expert resume writer and career coach. Your job is to rewrite a candidate's resume to maximize their ATS match rate for a specific job description.

CRITICAL RULES:
- NEVER fabricate experience, skills, or qualifications the candidate does not have
- You MAY reframe, reorder, and reword existing experience to lead with relevant keywords
- All factual content (companies, titles, dates, responsibilities) must remain accurate
- If a required skill is missing from the candidate's background, note it in the GAPS section — do not add it to the resume
- Keep the resume to 1 page if under 7 years experience, 2 pages max otherwise
- Use ATS-safe formatting: no tables, no headers/footers, no images, standard fonts implied

TARGET JOB:
Title: [JOB TITLE]
Company: [COMPANY NAME]

KEYWORD ANALYSIS (from previous analysis):
PRESENT: [list matched keywords]
MISSING: [list gap keywords — do NOT add these to the resume]

CANDIDATE'S CURRENT RESUME:
[FULL RESUME TEXT]

Please rewrite the resume with the following changes:
1. NEW PROFESSIONAL SUMMARY: Write a 3-sentence summary that directly addresses this specific role, incorporates the top 3-5 matched keywords naturally
2. REORDERED BULLETS: Move the most relevant bullet points to the top of each job entry. Rewrite bullets to lead with action verbs that match the job description's language
3. SKILLS SECTION: Reorganize to surface matched skills first
4. UNCHANGED: Keep all company names, job titles, dates, and factual achievements exactly as stated

After the resume, provide:
- CHANGES SUMMARY: Bullet list of what you changed and why
- GAPS: Any required skills/qualifications not in the candidate's background
- MATCH SCORE ESTIMATE: Your estimate of ATS match improvement (before vs. after)
```

---

### PROMPT 4 — ATS Formatting Check

```
Review this resume for ATS compatibility issues. Check for:
1. Any mention of tables, columns, or multi-column layouts
2. Headers or footers that ATS systems can't read
3. Any text inside text boxes or graphics
4. Non-standard section headings (convert to standard: Work Experience, Education, Skills, Summary)
5. Special characters that may not parse correctly

RESUME:
[PASTE TAILORED RESUME FROM PROMPT 3]

Flag any issues and provide the corrected version.
```

---

### For Complete Package ($99) — Cover Letter

```
Write a tailored cover letter for this job application.

CANDIDATE NAME: [Name]
TARGET ROLE: [Job Title] at [Company]
KEY STRENGTHS (from resume): [Top 3-4 relevant experiences/skills]

JOB DESCRIPTION (key requirements):
[Top 5-6 requirements from the JD]

Write a 3-paragraph cover letter:
- Paragraph 1: Opening hook + why this specific company/role (research the company briefly)
- Paragraph 2: Connect 2-3 specific experiences from their resume to the role's requirements
- Paragraph 3: Call to action

Tone: Professional but human. Not generic. No "I am writing to express my interest in..."
Length: 250-320 words
```

---

## Step 3: Format and Deliver

**Format the resume:**
1. Copy the tailored resume text from Claude
2. Open a clean Word document (or use Google Docs)
3. Use a clean, ATS-safe template:
   - Font: Calibri or Arial, 10-11pt body, 14-16pt name
   - No columns, no text boxes, no graphics
   - Standard section headings
   - 0.75" margins
4. Export as PDF + save as .docx

**Free ATS-safe templates to use:**
- Microsoft Word "Simple" template (built-in)
- Google Docs "Swiss" or "Serif" template
- Download a free ATS template from Jobscan.co/resume-templates

---

## Step 4: Compile the Delivery Package

Create a folder called "[CustomerName]_1stStep_Resume"

Include:
- `[Name]_[CompanyName]_Resume.pdf`
- `[Name]_[CompanyName]_Resume.docx`
- `[Name]_KeywordReport.txt` (copy-paste the gap analysis output)
- `[Name]_ChangesSummary.txt` (the changes summary from Prompt 3)
- `[Name]_CoverLetter.docx` (Complete package only)

Zip the folder. Upload to Google Drive or Dropbox and create a shareable link.

---

## Step 5: Send Delivery Email

Subject: `Your Tailored Resume is Ready — [Company Name] Application`

Body:
```
Hi [Name],

Your tailored resume is ready! Here's what's in your package:

📄 Resume (PDF + Word) — tailored for the [Job Title] role at [Company]
📊 Keyword Report — what matched, what was missing
📝 Changes Summary — plain-English breakdown of every change we made
[📨 Cover Letter — Complete package]

Download your files: [LINK]

KEY HIGHLIGHTS:
- Match score improved from [X]% to [Y]% (estimated)
- [2-3 specific things that were improved]
- Gap flagged: [any skills the JD requires that they don't have]

ONE REVISION INCLUDED: If anything looks off or you want a different angle,
just reply to this email and I'll turn it around within 12 hours.

Best of luck with your application!
— Evan
1stStep.ai
```

---

## Quality Checklist Before Sending

- [ ] No fabricated content (check against original resume)
- [ ] All dates, companies, titles unchanged
- [ ] ATS-safe format (no columns, tables, images)
- [ ] Keyword match visibly improved from original
- [ ] Gap section is honest and complete
- [ ] PDF opens correctly and text is selectable (not an image)
- [ ] File names are clean and professional
- [ ] Delivery email has working download link

---

## Handling Edge Cases

**"My resume is outdated / has gaps"**
Work with what's there. Flag the gaps honestly. Never fill them with invented content.

**"I have no experience in this field"**
Focus on transferable skills. Be honest in the gap analysis. The cover letter does more heavy lifting in career-change cases.

**"The job requires a degree I don't have"**
Note it in the gap analysis. Don't hide it. A tailored resume can still improve callback rate on other dimensions.

**Customer asks for a revision:**
Reply within 2 hours acknowledging the request. Deliver within 12 hours.
If the revision request is outside the scope (e.g., "tailor it for 3 other jobs"), offer to do additional orders.

---

## Pricing Reference

| Package | Price | Turnaround | Revisions |
|---------|-------|-----------|-----------|
| Essential | $49 | 24 hours | 1 round |
| Complete | $99 | 12 hours | 2 rounds |
| Rush add-on | +$29 | 4 hours | 1 round |

---

## Time Tracker (for your records)

- Keyword extraction (Prompt 1): ~5 min
- Gap analysis (Prompt 2): ~5 min
- Resume rewrite (Prompt 3): ~10 min
- ATS check (Prompt 4): ~3 min
- Cover letter (Complete): ~8 min
- Formatting + delivery: ~10 min
- **Total per Essential order: ~33 min**
- **Total per Complete order: ~41 min**

At $49–$99 per order, that's **$71–$145/hour** effective hourly rate.
10 orders/week = $490–$990/week with ~6 hours of work.
