/** Legacy side-panel shell retained for packaged-file compatibility.
 * The controlled beta keeps all account state and document work in 1stStep.ai. */
const APP_URL = 'https://app.1ststep.ai/concierge';
document.addEventListener('DOMContentLoaded', () => {
  const alertBox = document.getElementById('alert');
  if (alertBox) {
    alertBox.textContent = 'Continue in 1stStep.ai. The extension stores no profile, resume, or application status.';
    alertBox.style.display = 'block';
  }
  for (const button of document.querySelectorAll('button')) {
    button.textContent = button.id === 'resetBtn' ? 'Close' : 'Open 1stStep.ai';
    button.onclick = () => button.id === 'resetBtn' ? window.close() : chrome.tabs.create({ url: APP_URL });
  }
});
