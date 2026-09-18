const APP_URL = 'https://app.1ststep.ai';
const $ = id => document.getElementById(id);
let currentJob = null;

function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, response => {
    resolve(chrome.runtime.lastError ? null : response || null);
  }));
}

function render(job) {
  currentJob = job || null;
  $('details').hidden = !job;
  $('title').textContent = job?.jobTitle || 'Open a job posting';
  $('summary').textContent = job ? 'Ready to save to your Job Agent.' : 'Capture it in one click. No copying or pasting.';
  $('company').textContent = job?.company || 'Not listed';
  $('source').textContent = job?.sourceLabel || 'Current page';
  $('capture').textContent = job ? 'Save to My Jobs' : 'Capture this job';
  $('edit').hidden = !job;
  if (job) {
    $('jobTitle').value = job.jobTitle || '';
    $('companyName').value = job.company || '';
    $('editFields').hidden = Boolean(job.company);
  } else {
    $('editFields').hidden = true;
  }
}

async function capture() {
  $('capture').disabled = true;
  $('message').textContent = 'Checking this page…';
  const response = await send({ action: 'CAPTURE_ACTIVE_JOB' });
  if (!response?.success) {
    render(null);
    $('message').textContent = response?.error || 'Open a complete job posting and try again.';
    $('capture').disabled = false;
    return;
  }
  render(response.job);
  $('message').textContent = 'Job captured. Save it to continue.';
  $('capture').disabled = false;
}

async function save() {
  if (!currentJob) return capture();
  const jobTitle = $('jobTitle').value.trim();
  const company = $('companyName').value.trim();
  if (!jobTitle || !company) {
    $('editFields').hidden = false;
    $('message').textContent = 'Add the job title and company before saving.';
    (!jobTitle ? $('jobTitle') : $('companyName')).focus();
    return;
  }
  currentJob = { ...currentJob, jobTitle, company };
  $('capture').disabled = true;
  $('capture').textContent = 'Opening Job Agent…';
  const response = await send({ action: 'OPEN_IN_APP', jobData: currentJob });
  if (!response?.success) {
    $('message').textContent = response?.error || 'Could not open the Job Agent. Try again.';
    $('capture').disabled = false;
    $('capture').textContent = 'Save to My Jobs';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  $('capture').onclick = save;
  $('edit').onclick = () => {
    $('editFields').hidden = !$('editFields').hidden;
    if (!$('editFields').hidden) $('jobTitle').focus();
  };
  $('openJobs').onclick = () => chrome.tabs.create({ url: `${APP_URL}/concierge#jobs` });
  const status = await send({ action: 'GET_JOB_AGENT_STATUS' });
  $('connection').textContent = status?.success ? 'Agent connected' : 'Sign in to continue';
  await capture();
});
