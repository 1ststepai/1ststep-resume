/**
 * sites/lever.js
 * Lever ATS selectors
 * Lever pages are hosted at jobs.lever.co or jobs.lever.com
 * Selectors are stable and predictable
 */

export default {
  // Job Description Extraction
  jobDescriptionSelector: '.section-content, [data-section="description"]',
  jobTitleSelector: 'h2.posting-title, h1.title',
  companySelector: '.company-name, [data-company]',
  
  // Apply Button
  applyButtonSelector: 'a.postings-btn, button.postings-btn, button[aria-label*="Apply"]',
  
  // Application Form Selectors (Lever uses consistent naming)
  formFields: {
    firstName: 'input[name="firstName"], input[placeholder*="First"]',
    lastName: 'input[name="lastName"], input[placeholder*="Last"]',
    email: 'input[name="email"], input[type="email"]',
    phone: 'input[name="phone"], input[type="tel"]',
    fileUpload: 'input[type="file"][name*="resume"], input[type="file"]',
    textarea: 'textarea[name*="cover"], textarea[placeholder*="cover"]'
  },
  
  // Difficulty: Easy — Lever has clean, consistent form structure
  difficulty: 'easy'
};
