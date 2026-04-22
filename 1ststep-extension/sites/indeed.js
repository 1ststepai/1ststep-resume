/**
 * sites/indeed.js
 * Indeed job board selectors
 * Difficulty: Medium — Indeed uses iframe for apply modal, requires cross-frame messaging
 */

export default {
  // Job Description Extraction
  jobDescriptionSelector: '.jobsearch-JobComponent-description, #jobDetailsPanel',
  jobTitleSelector: '.jobsearch-JobComponent-title h1, h1.jobsearch-JobComponent-title',
  companySelector: '[data-company-name], .companyName',
  
  // Apply Button (opens Indeed Apply dialog)
  applyButtonSelector: 'button[aria-label*="Apply"], a.applyButtonContainer',
  
  // Indeed Apply is in an iframe — this is tricky
  // The form fields are within: iframe#indeed_iframe_modal
  formFields: {
    firstName: 'input[name="first_name"], input[aria-label*="First"]',
    lastName: 'input[name="last_name"], input[aria-label*="Last"]',
    email: 'input[name="email"], input[type="email"]',
    phone: 'input[name="phone"], input[type="tel"]',
    fileUpload: 'input[type="file"]',
    textarea: 'textarea[name="cover"], textarea'
  },
  
  // Indeed iframe identifier
  applyIframeSelector: 'iframe[name*="indeed"]',
  
  // Difficulty: Medium — iframe requires special handling
  difficulty: 'medium',
  
  // Note: Content script must detect iframe and use chrome.runtime.sendMessage
  // to communicate with the iframe (cross-origin policies apply)
  usesIframe: true
};
