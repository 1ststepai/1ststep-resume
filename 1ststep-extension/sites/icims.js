/**
 * sites/icims.js
 * iCIMS legacy ATS selectors
 * iCIMS is an older ATS platform with inconsistent markup across implementations
 * This is a placeholder — selectors need to be tuned per implementation
 */

export default {
  jobDescriptionSelector: '.job-description, #JobDescription, [class*="description"]',
  jobTitleSelector: 'h1.job-title, h1[class*="title"]',
  companySelector: '[class*="company"]',
  applyButtonSelector: 'button[aria-label*="Apply"], button:contains("Apply")',
  
  formFields: {
    firstName: 'input[name*="first"], input[placeholder*="First"]',
    lastName: 'input[name*="last"], input[placeholder*="Last"]',
    email: 'input[type="email"]',
    phone: 'input[type="tel"], input[name*="phone"]',
    fileUpload: 'input[type="file"]',
    textarea: 'textarea'
  },
  
  difficulty: 'medium',
  note: 'iCIMS markup varies per customer — these selectors are generic starting points'
};
