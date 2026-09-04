export function publicArtifactMetadata(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : []).map(({ contentBase64: _contentBase64, objectRef: _objectRef, inspection: _inspection, ...metadata }) => metadata);
}
