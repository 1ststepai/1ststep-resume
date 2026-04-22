/**
 * sites/linkedin.js
 * LinkedIn Easy Apply selectors
 * Selector documentation: https://github.com/1ststepai/1ststep-extension/wiki/LinkedIn-Selectors
 */

export default {
  // Job Description Extraction
  jobDescriptionSelector: '.show-more-less-html__markup, [id*="description"] > div',
  jobTitleSelector: 'h1.topcard__title',
  companySelector: '.topcard__company-name a, .topcard__organization-name',
  
  // Apply Button (using only valid CSS selectors)
  applyButtonSelector: 'button[aria-label*="Easy Apply"]',
  
  // Easy Apply Modal Selectors (for form filling)
  applyModal: '.artdeco-modal__header',
  formFields: {
    firstName: 'input[aria-label="First name"]',
    lastName: 'input[aria-label="Last name"]',
    email: 'input[aria-label="Email"]',
    phone: 'input[aria-label="Phone number"]',
    fileUpload: 'input[type="file"][aria-label*="Resume"]',
    textarea: 'textarea[aria-label*="Message"], textarea[aria-label*="Cover"]'
  },
  
  // Difficulty: Medium — modal is dynamic and selectors can shift
  // Note: LinkedIn heavily obfuscates class names; these may need updating
  difficulty: 'medium'
};
