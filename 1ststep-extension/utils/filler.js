/**
 * utils/filler.js
 * Generic form filling utility
 * Handles input, select, textarea, and file fields
 * Supports Shadow DOM piercing for complex ATS (Workday, etc.)
 */

/**
 * Fill a single form field with a value
 * Handles different input types and triggers change events for frameworks
 */
export function fillField(element, value) {
  if (!element || !value) return false;
  
  try {
    // Set value based on element type
    if (element.tagName === 'INPUT') {
      if (element.type === 'file') {
        // File inputs can't be filled programmatically for security reasons
        console.warn('[1stStep] File input cannot be programmatically filled');
        return false;
      } else {
        element.value = value;
      }
    } else if (element.tagName === 'SELECT') {
      // Find and select option
      const option = Array.from(element.options).find(
        opt => opt.text === value || opt.value === value
      );
      if (option) {
        element.value = option.value;
      } else {
        element.value = value;
      }
    } else if (element.tagName === 'TEXTAREA') {
      element.value = value;
    } else {
      element.innerText = value;
    }
    
    // Trigger change events for React/Vue/Angular frameworks
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // For specific form frameworks
    if (window.React) {
      const event = new InputEvent('input', { bubbles: true });
      element.dispatchEvent(event);
    }
    
    return true;
  } catch (error) {
    console.error('[1stStep] Failed to fill field:', error);
    return false;
  }
}

/**
 * Find form fields using selector and fill them
 * Returns { filled: count, total: count }
 */
export function fillFormFields(formFieldsMap, resumeData) {
  if (!formFieldsMap || !resumeData) {
    return { filled: 0, total: 0, message: 'Missing form fields or resume data' };
  }
  
  let filled = 0;
  let total = 0;
  const results = {};
  
  const fieldMappings = {
    firstName: resumeData.firstName,
    lastName: resumeData.lastName,
    email: resumeData.email,
    phone: resumeData.phone,
    summary: resumeData.summary,
    experience: resumeData.experience,
    education: resumeData.education
  };
  
  for (const [fieldName, selector] of Object.entries(formFieldsMap)) {
    if (!selector) continue;
    
    total++;
    const value = fieldMappings[fieldName];
    if (!value) {
      results[fieldName] = { success: false, reason: 'No data' };
      continue;
    }
    
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        results[fieldName] = { success: false, reason: 'Field not found' };
        continue;
      }
      
      // Fill the first matching element
      const element = elements[0];
      const success = fillField(element, value);
      
      if (success) {
        filled++;
        results[fieldName] = { success: true };
      } else {
        results[fieldName] = { success: false, reason: 'Fill failed' };
      }
    } catch (error) {
      results[fieldName] = { success: false, reason: error.message };
    }
  }
  
  return { filled, total, results };
}

/**
 * Pierce Shadow DOM to find elements
 * Used for Workday and other ATS with Shadow DOM
 */
export function querySelectorDeep(selector) {
  // Try normal DOM first
  const normalResult = document.querySelector(selector);
  if (normalResult) return normalResult;
  
  // Recursively search through Shadow DOM
  function searchInShadow(root) {
    // First, try direct querySelector
    try {
      const result = root.querySelector(selector);
      if (result) return result;
    } catch (e) {
      // Selector might be invalid for this context
    }
    
    // Search in children
    const children = root.children || [];
    for (let child of children) {
      // Check normal DOM
      const result = searchInShadow(child);
      if (result) return result;
      
      // Check shadow root if exists
      if (child.shadowRoot) {
        const shadowResult = searchInShadow(child.shadowRoot);
        if (shadowResult) return shadowResult;
      }
    }
    
    return null;
  }
  
  return searchInShadow(document);
}

/**
 * Fill form fields with Shadow DOM support
 * Retries with backoff if needed
 */
export async function fillFormFieldsWithShadowDOM(
  formFieldsMap,
  resumeData,
  options = {}
) {
  const { retryCount = 3, retryDelayMs = 500 } = options;
  
  let attempt = 0;
  while (attempt < retryCount) {
    const result = fillFormFields(formFieldsMap, resumeData);
    
    if (result.filled === result.total) {
      // All fields filled successfully
      return result;
    }
    
    if (attempt < retryCount - 1) {
      console.log(`[1stStep] Filled ${result.filled}/${result.total} fields, retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    
    attempt++;
  }
  
  return result;
}

/**
 * Check if a form is complete
 * Returns { isComplete, missingFields }
 */
export function isFormComplete(formFieldsMap) {
  const required = Object.keys(formFieldsMap).slice(0, 4); // First names, last name, email, phone
  const missingFields = [];
  
  for (const fieldName of required) {
    const selector = formFieldsMap[fieldName];
    if (!selector) continue;
    
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0 || !elements[0].value) {
      missingFields.push(fieldName);
    }
  }
  
  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
}
