## 🛡️ Emergency Recovery (The "Gold" State)

- **Stable Deployment ID:** `b92aab8`
    
- **Reason:** Last known version with working Sidebar and Desktop Nav before AI-induced layout collapse.
    
- **The "Nuke" Commands (Run these to fix local drive):**
  
PowerShell
git reset --hard b92aab8
git clean -fd
git commit --allow-empty -m "Rescue build: wiping AI slop"
git push origin main --force

## 🛠️ Upcoming Dev Roadmap

1. **Mobile Cleanup:** - Optimize touch targets (48x48px).
    
    - Fix flexbox squashing issues caused by previous AI iterations.
        
    - Use `clamp()` for responsive text.
    
    
- - [ ] **Feature:** Add `ImportButton.tsx` to handle JSON data restoration.
- [ ] **Safety:** Add validation to ensure the uploaded JSON matches the expected schema (prevents app crashes).
        
2. **Chrome Extension (Job Hunter Tool):**
    
    - Goal: Auto-fill LinkedIn/Indeed applications.
        
    - Tech: Manifest V3, Content Scripts.
        
    - _Note: Implement random delays to avoid LinkedIn bot detection._
      
      ## ⚠️ Anti-Slop Protocols (Read before prompting AI)

- **Branching Rule:** Always run `git checkout -b <feature-name>` before letting an AI touch code.
    
- **One-File Rule:** Do not let AI refactor multiple files at once. Focus on specific CSS blocks.
    
- **Placeholders:** Check for `???` or `[Insert Code Here]` before pushing to main.
    
- **Vercel Hobby Tier:** Remember, "Instant Rollback" is disabled. Manual redeploy via Git is the only way.