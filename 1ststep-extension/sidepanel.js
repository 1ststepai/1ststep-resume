/**
 * sidepanel.js
 * Side panel UI for resume tailoring
 */

import * as auth from './utils/auth.js';

const APP_URL = 'https://app.1ststep.ai';

// DOM elements
const alert = document.getElementById('alert');
const detectedTitle = document.getElementById('detectedTitle');
const detectedCompany = document.getElementById('detectedCompany');
const jobDescription = document.getElementById('jobDescription');
const tailorBtn = document.getElementById('tailorBtn');
const resetBtn = document.getElementById('resetBtn');
const resultCard = document.getElementById('resultCard');
const resultContent = document.getElementById('resultContent');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');

let lastTailoredResult = null;

// ─── INITIALIZATION ────────────────────────────────────────

async function init() {
  try {
    // Check if user is authenticated
    const authStatus = await auth.checkAuth();
    if (!authStatus.isAuthenticated) {
      showAlert('Please sign in to 1stStep.ai to use this feature.', 'warning');
      tailorBtn.disabled = true;
      return;
    }
    
    // Load current job from background
    loadCurrentJob();
    
    // Set up event listeners
    tailorBtn.addEventListener('click', () => tailorResume(authStatus));
    resetBtn.addEventListener('click', resetForm);
    downloadBtn.addEventListener('click', downloadResult);
    copyBtn.addEventListener('click', copyResult);
    
  } catch (error) {
    console.error('[1stStep] Init error:', error);
    showAlert('Initialization failed: ' + error.message, 'warning');
  }
}

// ─── CURRENT JOB LOADING ────────────────────────────────────

async function loadCurrentJob() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'GET_CURRENT_JOB' },
      (response) => {
        if (response?.job) {
          const job = response.job;
          detectedTitle.value = job.jobTitle || 'Unknown';
          detectedCompany.value = job.company || 'Unknown';
          jobDescription.value = job.jobDescription || '';
          jobDescription.focus();
        }
        resolve();
      }
    );
  });
}

// ─── TAILOR WORKFLOW ───────────────────────────────────────

async function tailorResume(authStatus) {
  try {
    if (!jobDescription.value.trim()) {
      showAlert('Please provide a job description.', 'warning');
      return;
    }
    
    tailorBtn.disabled = true;
    tailorBtn.textContent = '⏳ Tailoring...';
    
    // Get user resume
    const resume = await auth.getUserResume();
    if (!resume) {
      throw new Error('No resume found. Please add your resume in 1stStep.ai.');
    }
    
    // Call backend to tailor
    const response = await fetch(`${APP_URL}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callType: 'tailor',
        resume: resume,
        jobDescription: jobDescription.value,
        userEmail: authStatus.email,
        tierToken: authStatus.tierToken,
        model: 'claude-sonnet-4-6',
        messages: [
          {
            role: 'user',
            content: `Please tailor this resume for this job description:\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDescription.value}`
          }
        ],
        max_tokens: 2048
      })
    });
    
    if (!response.ok) {
      throw new Error(`Tailor failed: ${response.status}`);
    }
    
    const result = await response.json();
    lastTailoredResult = result;
    
    // Show result
    showResult(result);
    showAlert('✓ Resume tailored successfully!', 'success');
    
  } catch (error) {
    console.error('[1stStep] Tailor error:', error);
    showAlert('Tailoring failed: ' + error.message, 'warning');
  } finally {
    tailorBtn.disabled = false;
    tailorBtn.textContent = 'Tailor Resume';
  }
}

// ─── RESULT DISPLAY ────────────────────────────────────────

function showResult(result) {
  resultCard.classList.add('visible');
  
  // Display result (could be HTML or plain text)
  if (result.html) {
    resultContent.innerHTML = result.html;
  } else if (result.text) {
    resultContent.textContent = result.text;
  } else {
    resultContent.textContent = JSON.stringify(result, null, 2);
  }
}

// ─── DOWNLOAD RESULT ───────────────────────────────────────

async function downloadResult() {
  if (!lastTailoredResult) return;
  
  try {
    // For now, just copy the text
    // Full DOCX download would require a library like docx or docxtemplater
    copyResult();
    showAlert('Copied to clipboard. You can paste into a DOCX or Google Docs.', 'success');
  } catch (error) {
    showAlert('Download failed: ' + error.message, 'warning');
  }
}

// ─── COPY RESULT ───────────────────────────────────────────

async function copyResult() {
  if (!lastTailoredResult) return;
  
  try {
    const text = lastTailoredResult.text || resultContent.textContent;
    await navigator.clipboard.writeText(text);
    showAlert('✓ Copied to clipboard!', 'success');
  } catch (error) {
    showAlert('Copy failed: ' + error.message, 'warning');
  }
}

// ─── RESET FORM ────────────────────────────────────────────

function resetForm() {
  jobDescription.value = '';
  resultCard.classList.remove('visible');
  lastTailoredResult = null;
  jobDescription.focus();
}

// ─── ALERT HELPER ──────────────────────────────────────────

function showAlert(message, type = 'warning') {
  alert.textContent = message;
  alert.className = `alert alert-${type}`;
  alert.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      alert.style.display = 'none';
    }, 3000);
  }
}

// Initialize
init();
