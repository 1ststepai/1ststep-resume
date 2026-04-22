/**
 * popup.js
 * Handles popup UI and user interactions
 */

import * as auth from './utils/auth.js';

const APP_URL = 'https://app.1ststep.ai';

// DOM elements
const statusBadge = document.getElementById('statusBadge');
const loadingState = document.getElementById('loadingState');
const unauthState = document.getElementById('unauthState');
const jobState = document.getElementById('jobState');
const jobCard = document.getElementById('jobCard');
const emptyState = document.getElementById('emptyState');
const jobTitle = document.getElementById('jobTitle');
const company = document.getElementById('company');
const site = document.getElementById('site');
const matchScore = document.getElementById('matchScore');
const tailorBtn = document.getElementById('tailorBtn');
const autofillBtn = document.getElementById('autofillBtn');
const openAppLink = document.getElementById('openAppLink');

// ─── INITIALIZATION ────────────────────────────────────────

async function init() {
  try {
    // Check authentication
    const authStatus = await auth.checkAuth();
    
    if (!authStatus.isAuthenticated) {
      showUnauthState();
      return;
    }
    
    // User is authenticated
    updateAuthBadge(authStatus);
    
    // Check for detected job
    const currentJob = await getCurrentJob();
    
    if (currentJob) {
      showJobCard(currentJob, authStatus);
    } else {
      showEmptyState();
    }
  } catch (error) {
    console.error('[1stStep] Init error:', error);
    showEmptyState();
  } finally {
    loadingState.style.display = 'none';
  }
}

// ─── AUTH STATES ────────────────────────────────────────────

function updateAuthBadge(authStatus) {
  statusBadge.textContent = authStatus.tier === 'complete' ? 'Complete' : 'Free';
  statusBadge.classList.add('authenticated');
}

function showUnauthState() {
  loadingState.style.display = 'none';
  unauthState.style.display = 'block';
  jobState.style.display = 'none';
  statusBadge.textContent = 'Sign In';
  statusBadge.classList.remove('authenticated');
  
  openAppLink.addEventListener('click', () => {
    chrome.tabs.create({ url: APP_URL });
  });
}

// ─── JOB DETECTION ─────────────────────────────────────────

async function getCurrentJob() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'GET_CURRENT_JOB' },
      (response) => {
        resolve(response?.job || null);
      }
    );
  });
}

function showJobCard(job, authStatus) {
  jobCard.classList.add('visible');
  emptyState.style.display = 'none';
  
  jobTitle.textContent = job.jobTitle || 'Unknown Role';
  company.textContent = job.company || 'Unknown Company';
  site.textContent = job.site?.toUpperCase() || 'UNKNOWN';
  
  // Placeholder match score (will be calculated on demand)
  matchScore.textContent = '—';
  
  // Set up button handlers
  tailorBtn.onclick = () => tailorResume(job, authStatus);
  autofillBtn.onclick = () => autoFillForm(job, authStatus);
  
  // Disable buttons if tier restrictions apply
  if (authStatus.tier === 'free') {
    // Free tier can still tailor, but not cover letters, etc.
    tailorBtn.disabled = false;
  }
}

function showEmptyState() {
  loadingState.style.display = 'none';
  jobState.style.display = 'block';
  jobCard.classList.remove('visible');
  emptyState.style.display = 'flex';
}

// ─── TAILOR WORKFLOW ───────────────────────────────────────

async function tailorResume(job, authStatus) {
  try {
    tailorBtn.disabled = true;
    tailorBtn.textContent = 'Tailoring...';
    
    // Get user resume
    const resume = await auth.getUserResume();
    if (!resume) {
      alert('No resume found. Please add your resume in 1stStep.ai.');
      return;
    }
    
    // Call backend to tailor resume
    const response = await fetch(`${APP_URL}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callType: 'tailor',
        resume: resume,
        jobDescription: job.jobDescription,
        email: authStatus.email,
        tierToken: authStatus.tierToken
      })
    });
    
    if (!response.ok) {
      throw new Error(`Tailor failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Show success and option to download
    tailorBtn.textContent = '✓ Tailored';
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Option 1: Download DOCX
    // Option 2: Copy to clipboard
    // Option 3: Open in sidepanel
    
    chrome.runtime.sendMessage({
      action: 'SHOW_RESULT',
      result: result
    });
    
  } catch (error) {
    console.error('[1stStep] Tailor error:', error);
    tailorBtn.textContent = 'Error';
    alert('Tailoring failed: ' + error.message);
  } finally {
    tailorBtn.disabled = false;
    tailorBtn.textContent = 'Tailor Resume';
  }
}

// ─── AUTO-FILL WORKFLOW ────────────────────────────────────

async function autoFillForm(job, authStatus) {
  try {
    autofillBtn.disabled = true;
    autofillBtn.textContent = 'Filling...';
    
    // Get user profile and resume
    const resume = await auth.getUserResume();
    const profile = await auth.getUserProfile();
    
    if (!resume || !profile) {
      alert('Please complete your profile in 1stStep.ai first.');
      return;
    }
    
    // Get autofill field map from backend
    const response = await fetch(`${APP_URL}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callType: 'autofill',
        resume: resume,
        jobDescription: job.jobDescription,
        email: authStatus.email,
        tierToken: authStatus.tierToken
      })
    });
    
    if (!response.ok) {
      throw new Error(`Autofill mapping failed: ${response.status}`);
    }
    
    const fieldMap = await response.json();
    
    // Send autofill instruction to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'AUTOFILL_FORM',
      fieldMap: fieldMap,
      profile: profile,
      resume: resume
    }, (response) => {
      if (response?.success) {
        autofillBtn.textContent = '✓ Filled';
        
        // Track event
        chrome.runtime.sendMessage({
          action: 'TRACK_EVENT',
          email: authStatus.email,
          event: 'extension_apply'
        });
        
        // Close popup after success
        setTimeout(() => window.close(), 1000);
      } else {
        autofillBtn.textContent = 'Error';
        alert(response?.error || 'Auto-fill failed');
      }
    });
    
  } catch (error) {
    console.error('[1stStep] Autofill error:', error);
    autofillBtn.textContent = 'Error';
    alert('Auto-fill setup failed: ' + error.message);
  } finally {
    autofillBtn.disabled = false;
    autofillBtn.textContent = 'Auto-fill';
  }
}

// ─── LIFECYCLE ─────────────────────────────────────────────

// Initialize on popup open
init();

// Refresh job detection every 1 second (in case user navigated)
setInterval(async () => {
  const job = await getCurrentJob();
  if (job) {
    jobCard.classList.add('visible');
    emptyState.style.display = 'none';
  } else {
    jobCard.classList.remove('visible');
    emptyState.style.display = 'flex';
  }
}, 1000);
