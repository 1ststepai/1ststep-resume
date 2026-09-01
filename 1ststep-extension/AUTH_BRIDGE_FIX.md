# Auth bridge boundary

The former localStorage-to-Chrome-sync bridge was retired. Authentication now remains in the app's encrypted HttpOnly signed-user session. The extension asks an open `app.1ststep.ai` tab to make same-origin API calls and never receives an auth token.

Candidate values are returned only after a single-use sharing approval is durably consumed. They are held in message memory long enough to fill the exact Greenhouse fields and are never written to browser storage or logs.
