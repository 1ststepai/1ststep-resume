/**
 * sites/greenhouse.js
 * Greenhouse Applicant Tracking System selectors
 * Greenhouse pages are hosted at boards.greenhouse.io
 * Selectors are more stable than LinkedIn due to lack of obfuscation
 */

export default {
  // Job Description Extraction
  jobDescriptionSelector: '.js-job-description, [id="job-description"]',
  jobTitleSelector: '.app-title, h1.application-title',
  companySelector: '.company-name, [data-company]',
  
  // Apply Button
  applyButtonSelector: 'a.application-button, button.application-button, button[aria-label*="Apply"]',
  
  // Application Form Selectors
  formFields: {
    firstName: 'input[name="first_name"], input[data-name="first_name"]',
    lastName: 'input[name="last_name"], input[data-name="last_name"]',
    email: 'input[name="email"], input[data-name="email"], input[type="email"]',
    phone: 'input[name="phone"], input[data-name="phone"], input[type="tel"]',
    fileUpload: 'input[type="file"][name*="resume"], input[type="file"][accept*="pdf"]',
    textarea: 'textarea[name*="cover"], textarea[data-name*="cover"]'
  },
  
  // Difficulty: Easy — Greenhouse has stable, predictable HTML structure
  difficulty: 'easy'
};
