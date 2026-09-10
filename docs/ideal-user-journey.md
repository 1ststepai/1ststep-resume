# Ideal user journey

## North-star flow

```mermaid
flowchart TD
  A[Create account or continue locally] --> B[Import resume/profile]
  B --> C[Show first verified job paths immediately]
  C --> D[Ask only the highest-impact missing boundary]
  D --> E[Start deterministic discovery]
  E --> F[Verify and deduplicate roles]
  F --> G[Hard-filter against policy]
  G --> H[Rank qualified survivors]
  H --> I[Prepare truthful application package]
  I --> J{Exception?}
  J -- Yes --> K[One Needs You action]
  J -- No --> L[Review package and sharing scope]
  K --> L
  L --> M[Execute through supported adapter]
  M --> N[Action-time final approval]
  N --> O[Submit and verify employer receipt]
  O --> P[Track follow-up, interview, outcome]
  P --> Q[Propose learning; user confirms material changes]
  Q --> E
```

## Screen model

The primary product should have four user concepts:

1. **Home:** one next action, current progress, and recent outcomes.
2. **My Jobs:** matches, preparing, needs you, submitted, interviews, closed.
3. **Saved Info:** verified facts, preferences, policies, permissions, and provenance.
4. **Agent Status:** whether discovery/preparation is running, paused, or needs recovery.

Resume tools, Career Positioning, LinkedIn optimization, interview practice, and tracker details become contextual actions within those four concepts, not permanent top-level destinations.

## Progressive learning

- Import first; parse facts into a draft Career Profile with source citations.
- Let the user confirm a small high-impact subset: identity/contact, current/recent roles, target path, work location, work authorization, salary floor, relocation/travel, exclusions.
- Show jobs before exhaustive cleanup.
- Ask additional questions only when they block a real qualifying application or materially expand coverage.
- Reuse exact or semantically canonicalized answers only within explicit scope and expiry.

## Human interruption budget

- Target: no more than one interruption per qualified application before final review.
- Batch low-risk confirmations when they share a clear scope.
- Never batch OTP, CAPTCHA, signatures, attestations, sensitive demographic answers, legal acknowledgements, or final submission approval.
- Keep all other jobs moving when one job is blocked.

## Full-autopilot experience

Full Autopilot is exception-based processing within a user-approved policy, not unrestricted clicking. The user still reviews material representations and authorizes final external action until legal, reliability, and receipt coverage justify narrower pre-authorization for explicitly defined low-risk cases.

## Mobile role

Mobile is the control plane: approve packages, answer a blocking question, adjust policy, pause/resume, inspect progress, and receive privacy-safe alerts. Employer form automation remains in desktop browser/server execution; mobile should not reproduce a desktop ATS or the full legacy resume editor.
