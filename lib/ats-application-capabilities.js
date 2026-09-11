const capability = (definition) => Object.freeze(definition);

export const ATS_APPLICATION_CAPABILITIES = Object.freeze({
  greenhouse: capability({ provider: 'greenhouse', discovery: 'supported', assistedFill: 'controlled-extension-candidate', checkpointRecovery: 'implemented-not-live', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
  lever: capability({ provider: 'lever', discovery: 'supported', assistedFill: 'unavailable', checkpointRecovery: 'unavailable', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
  ashby: capability({ provider: 'ashby', discovery: 'supported', assistedFill: 'unavailable', checkpointRecovery: 'unavailable', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
  smartrecruiters: capability({ provider: 'smartrecruiters', discovery: 'supported', assistedFill: 'unavailable', checkpointRecovery: 'unavailable', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
  workable: capability({ provider: 'workable', discovery: 'unavailable', assistedFill: 'unavailable', checkpointRecovery: 'unavailable', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
  workday: capability({ provider: 'workday', discovery: 'unavailable', assistedFill: 'human-assisted', checkpointRecovery: 'unavailable', submission: 'disabled', receiptEvidence: 'not-configured', live: false }),
});

export function atsApplicationCapability(provider) {
  return ATS_APPLICATION_CAPABILITIES[String(provider || '').trim().toLowerCase()] || null;
}

