# Engagement → GHL → Auto-DM Setup
## Beta invite code: LAUNCH2026

Open a fresh Claude Cowork chat and say: "Create these scheduled tasks" then paste each block below.

---

## TASK 1: LinkedIn Engagement → Auto-DM (runs 7pm daily)

**taskId:** linkedin-engagement-dm  
**cronExpression:** 0 19 * * *  
**description:** Check today's LinkedIn post engagement, DM engagers with beta invite code, add to GHL

---
PROMPT:

You are running an automated beta outreach task for Evan Pancis / 1stStep.ai (app.1ststep.ai). The beta invite code is **LAUNCH2026**.

1stStep.ai is an AI resume tailoring tool — shows job seekers their exact skill gaps, tailors their resume to any job in 30 seconds, writes their cover letter. Free to start, $19/mo Essential, $39/mo Complete.

**Goal:** Find everyone who liked or commented on Evan's LinkedIn posts today, DM them a personalized beta invite, and add them as contacts in GHL.

---

### STEP 1 — Find today's post engagers on LinkedIn

1. Navigate to https://www.linkedin.com/in/evanpancis/recent-activity/shares/
2. Find posts published today (check the timestamp)
3. For each post from today:
   a. Click the reaction count (e.g. "47 reactions") to open the list of who reacted
   b. Screenshot/note every person's name and headline
   c. Go back and click on the comments section — note every commenter's name
4. Compile a list: Name | Headline | Connection degree (1st/2nd/3rd) | Liked/Commented

### STEP 2 — Send DMs or connection requests

For each person on the list:

**If 1st connection (can DM directly):**
Navigate to their profile → Message → Send this DM (personalize the opening with their name):

> "Hey [First Name] — glad the post resonated. We just opened up beta access for 1stStep.ai, an AI tool that finds your exact resume skill gaps and rewrites it to match any job in 30 seconds. Thought you might want early access — invite code is LAUNCH2026, free to try at app.1ststep.ai. Would love your feedback if you give it a shot."

**If 2nd or 3rd connection (must send connection request first):**
Click Connect → Add a note → Send this (keep it under 300 chars):

> "Hey [First Name] — saw you on my resume/ATS post. Building 1stStep.ai (AI resume tailoring, in beta). Invite code LAUNCH2026 is free — app.1ststep.ai. Would love your take if you're job hunting or know someone who is."

### STEP 3 — Add each person to GHL

1. Navigate to Evan's GHL subaccount at https://app.gohighlevel.com
2. Go to Contacts → Add Contact for each person
3. Fill in:
   - Full Name
   - Source: "LinkedIn Post Engagement"
   - Notes: "Engaged with LinkedIn post on [today's date]. DM sent with invite code LAUNCH2026. Post topic: [topic of the post they engaged with]"
4. Add to pipeline stage: "Beta Outreach — Contacted"

### If anything goes wrong
- If LinkedIn requires verification, stop and notify Evan
- If GHL login is needed, stop and notify Evan
- Log all contacts you attempted to add to: C:\Users\evanp\Documents\Claude\Projects\AI-Powered Job Search Platform\outreach_log\ with today's date as filename
- Never send more than 20 DMs/connection requests per day (LinkedIn rate limit protection)

---

## TASK 2: X/Twitter Engagement → Auto-DM (runs 7:30pm daily)

**taskId:** twitter-engagement-dm  
**cronExpression:** 30 19 * * *  
**description:** Check today's X post replies, DM repliers with beta invite code, add to GHL

---
PROMPT:

You are running an automated beta outreach task for @1ststepai / 1stStep.ai. The beta invite code is **LAUNCH2026**.

1stStep.ai is an AI resume tailoring tool — shows job seekers their exact skill gaps, tailors their resume to any job in 30 seconds, writes their cover letter. Free to start, $19/mo Essential.

**Goal:** Find everyone who replied to @1ststepai's posts today, DM them a personalized beta invite, and add them to GHL.

---

### STEP 1 — Find today's post replies on X

1. Navigate to https://x.com/1ststepai
2. Find posts published today
3. Click into each post and note every person who:
   a. Replied to the post
   b. Quote-tweeted it
4. Compile list: Username | Display name | What they said

### STEP 2 — Send DMs

For each person who replied or quoted:

Navigate to their profile → Message icon → Send:

> "Hey [Display Name] — appreciate the reply on our post. We're running a private beta for 1stStep.ai, an AI tool that finds your exact resume skill gaps and rewrites it to match any job in 30 seconds. Invite code **LAUNCH2026** gets you in free at app.1ststep.ai — would love your feedback."

**If DMs are restricted** (account doesn't allow messages from non-followers):
Reply publicly to their comment instead:

> "@[username] appreciate it! If you want early access — invite code LAUNCH2026 is free at app.1ststep.ai 🚀"

### STEP 3 — Add each person to GHL

1. Navigate to https://app.gohighlevel.com
2. Contacts → Add Contact for each person
3. Fill in:
   - Name: their display name
   - Source: "X/Twitter Post Engagement"
   - Notes: "Replied to @1ststepai post on [today's date]. DM sent with invite code LAUNCH2026."
4. Pipeline stage: "Beta Outreach — Contacted"

### Limits & error handling
- Max 15 DMs per day on X (rate limit protection)
- If X requires verification, stop and notify Evan
- Log all outreach to: C:\Users\evanp\Documents\Claude\Projects\AI-Powered Job Search Platform\outreach_log\ with today's date + "twitter" as filename

---

## TASK 3: Twitter Posts (3x daily — Morning, Midday, Evening)

See twitter_scheduled_tasks_SETUP.md for these 3 tasks.

---

## Full system overview once all tasks are running:

| Time | Task |
|------|------|
| 9:00 AM | Post to X (morning — ATS/resume tip) |
| 9:00 AM | Post to LinkedIn (daily — longer post) |
| 12:00 PM | Post to X (midday — beta spotlight) |
| 6:00 PM | Post to X (evening — story/engagement) |
| 7:00 PM | LinkedIn engagement check → DM engagers → Add to GHL |
| 7:30 PM | X engagement check → DM repliers → Add to GHL |

## Beta invite code
**LAUNCH2026** — update this in both task prompts if the code changes.
