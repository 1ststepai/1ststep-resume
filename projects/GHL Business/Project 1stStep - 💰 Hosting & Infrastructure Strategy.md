## 💰 Hosting & Infrastructure Strategy

### Railway (Current)
- **Status:** Using $5 one-time credit. 
- **Action:** Monitor credit usage in dashboard. Do not upgrade to a paid plan until credit is exhausted.
- **Last Stable Hash:** `22e8335` (Onboarding Engine).

### Render (The $0 Backup Plan)
- **Status:** Migrate here if Railway credits run out.
- **Downside:** "Cold Starts" (15-min sleep timer).
- **Database Warning:** Free PostgreSQL databases are deleted every 30 days.

### ⏰ The "Anti-Sleep" Hack (For Render/Free Tiers)
- **Method:** Use [UptimeRobot](https://uptimerobot.com/) or [Cron-job.org](https://cron-job.org/).
- **The Setup:** 1. Create a `/keep-alive` route in the Node.js code.
    2. Set a ping every 14 minutes.
- **Caution:** Do NOT use this on Railway (it will drain your $5 credit faster). Only use on Render.

---

## 🛠️ Updated Roadmap
- [ ] **GHL Engine:** Finish logic using Railway's free credits.
- [ ] **Monitoring:** If Railway hits $0, pivot to Render + UptimeRobot.
- [ ] - [ ] **API:** Add OAuth2 "Multiple Location" support (for agencies with 10+ sub-accounts).
    
- [ ] **Frontend:** Build a "Welcome Screen" that asks: "What is your average lead worth?" to set the Lead Value.
    
- [ ] **Backend:** Add a `bull-mq` queue to handle GHL API burst limits (100 req / 10 sec).

### 🛡️ Your "Broke-Proof" Roadmap (Add to Obsidian)

1. **[ ] Move to Render:** Migrate the `GHL-Onboarding-Engine` code from Railway to Render (no credit card needed).
    
2. **[ ] Keep-Alive:** Connect UptimeRobot to your `/keep-alive` endpoint.
    
3. **[ ] Data Storage:** Connect the engine to a Google Sheet (using a Service Account) so you never have to pay for a database.
    
4. **[ ] Frontend:** Keep your Resume/SaaS site on **Vercel** (the best free frontend host).