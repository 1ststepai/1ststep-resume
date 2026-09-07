export function reviewablePackageBase(base) {
  return base?.taskType === 'application_package' && ['Finished', 'Waiting for You'].includes(base.status)
    && Boolean(base.result?.documentVersion && base.result?.resumeText)
    && Array.isArray(base.result?.sourceMap);
}
