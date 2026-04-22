This is your main technical manual. It should house the **"Zero-Dollar Logic Flow"** (Webhook → Sub-Account → Snapshot → User → Hardwire).


## 🧠 GHL Engine: The "Zero-Dollar" Blueprint

### 1. Hosting: Render + UptimeRobot (The Forever-Free Duo)

- **Platform:** [Render.com](https://render.com) (Web Service).
    
- **The Problem:** Render sleeps after 15 minutes of inactivity.
    
- **The Fix:** * Add a `/ping` route in your Node.js code that returns a `200 OK`.
    
    - Set up a Free Monitor on [UptimeRobot.com](https://uptimerobot.com).
        
    - **Interval:** **5 minutes** (The standard UptimeRobot free tier interval). This keeps your engine "warm" 24/7 so GHL webhooks never time out.
        

### 2. Database: Google Sheets (The Permanent Store)

- **Platform:** Google Sheets API.
    
- **Why:** Render’s free databases delete themselves after 30 days. Google Sheets is free forever.
    
- **Setup:**
    
    - Create a "Database" Sheet.
        
    - Use a **Service Account** (free via Google Cloud Console) to grant your Engine "Editor" access to that specific sheet.
        
    - **Data to Log:** Client Name, Email, GHL Location ID, Niche, and Onboarding Status.
        

### 3. Logic Flow: The "Digital Factory"

1. **Webhook Catch:** GHL sends a "New Client" webhook to Render.
    
2. **Location Check:** Engine checks the Google Sheet to see if the client already exists.
    
3. **API Call (POST):** Create a new **Sub-Account** via GHL API v2 (using a Private Integration Token).
    
4. **The "Magic" Injection:** Engine triggers a **Snapshot Deployment** based on the niche (HVAC, MedSpa, etc.).
    
5. **Hardwire Metric:** Automatically sets a **Custom Value** for `{{lead_value}}` so the "Projected Loss" dashboard works instantly.
    

### 4. Safety: Error Handling for "Broke" Servers

- **Burst Limit:** GHL allows **100 requests per 10 seconds**.
    
- **Logic:** If your engine hits a limit, use a `setTimeout` to retry after 11 seconds. This prevents your free server from crashing or losing data.
    

---

### 🛡️ Why this works for you right now:

- **$0 Monthly Cost:** You are using free tiers for hosting, monitoring, and data storage.
    
- **Scalable:** This logic works the same for your 1st client as it does for your 100th.
    
- **Zero Loss:** Because you’re logging everything to Google Sheets _before_ you run the GHL commands, you’ll never lose a client's data if a script crashes.