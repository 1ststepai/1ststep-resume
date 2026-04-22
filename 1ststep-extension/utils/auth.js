/**
 * utils/auth.js
 * Authentication and token management for extension
 * Handles tier verification and user profile retrieval
 */

const APP_URL = 'https://app.1ststep.ai';

/**
 * Get stored user profile from extension storage
 * Profile should have been synced from app.1ststep.ai
 */
export async function getUserProfile() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('1ststep_profile', (data) => {
      resolve(data['1ststep_profile'] || null);
    });
  });
}

/**
 * Get user tier token for API calls
 * Handles caching and expiry validation
 */
export async function getTierToken(email) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'GET_TIER_TOKEN', email },
      (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Get user resume text
 */
export async function getUserResume() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('1ststep_resume', (data) => {
      resolve(data['1ststep_resume'] || '');
    });
  });
}

/**
 * Check if user is authenticated
 * Returns { isAuthenticated, tier, email }
 */
export async function checkAuth() {
  const profile = await getUserProfile();
  
  if (!profile || !profile.email) {
    return { isAuthenticated: false };
  }
  
  const tierData = await getTierToken(profile.email);
  
  return {
    isAuthenticated: true,
    email: profile.email,
    name: profile.name,
    tier: tierData?.tier || 'free',
    tierToken: tierData?.tierToken,
    status: tierData?.status
  };
}

/**
 * Validate that user has permission for an action
 * Returns { allowed, message }
 */
export function validateTierAccess(tier, action) {
  const permissions = {
    'tailor': ['free', 'complete'],
    'cover_letter': ['complete'],
    'interview': ['complete'],
    'chat': ['complete']
  };
  
  const allowedTiers = permissions[action] || [];
  
  if (allowedTiers.includes(tier)) {
    return { allowed: true };
  }
  
  const tierName = tier === 'free' ? 'Free' : 'Complete';
  return {
    allowed: false,
    message: `${action} is not available on your ${tierName} plan. Upgrade to Complete.`
  };
}

/**
 * Set user profile (called when syncing from app)
 */
export function setUserProfile(profile) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ '1ststep_profile': profile }, resolve);
  });
}

/**
 * Set user resume (called when syncing from app)
 */
export function setUserResume(resume) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ '1ststep_resume': resume }, resolve);
  });
}

/**
 * Clear all user data (logout)
 */
export function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.sync.clear(resolve);
  });
}
