/**
 * sites/workday.js
 * Workday HCM ATS selectors
 * ⚠️ HARDEST TO MAINTAIN — Uses Shadow DOM extensively
 * Workday heavily obfuscates selectors and changes them frequently
 * 
 * Strategy: Use MutationObserver + retries, pierce Shadow DOM when possible
 */

export default {
  // Job Description Extraction
  // Workday embeds JD in Shadow DOM — may need special handling
  jobDescriptionSelector: '[data-automation-id="jobDescription"], div[role="region"] > div',
  jobTitleSelector: 'h1[data-automation-id="jobTitle"], h1[role="heading"]',
  companySelector: '[data-automation-id="companyName"], div[data-automation-id*="company"]',
  
  // Apply Button
  applyButtonSelector: 'button[data-automation-id="applyButton"], button[aria-label*="Apply"]',
  
  // Application Form Selectors
  // Workday uses nested Shadow DOM — filler.js must pierce shadowRoot
  formFields: {
    firstName: 'input[data-automation-id="firstName"], input[aria-label*="First"]',
    lastName: 'input[data-automation-id="lastName"], input[aria-label*="Last"]',
    email: 'input[data-automation-id="email"], input[type="email"]',
    phone: 'input[data-automation-id="phone"], input[type="tel"]',
    fileUpload: 'input[type="file"]',
    textarea: 'textarea[data-automation-id*="cover"], textarea'
  },
  
  // Special handler for Shadow DOM piercing
  pierceShado wRoot: true,
  shadowHostSelector: '[data-automation-id="form"]',
  
  // Difficulty: Hard — requires special handling
  difficulty: 'hard',
  
  // Note: Content script should use MutationObserver to wait for form to render
  // Workday is an SPA that renders forms dynamically
  retryCount: 5,
  retryDelayMs: 500
};
