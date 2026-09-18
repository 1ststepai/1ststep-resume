import { createHash } from 'node:crypto';
import { buildApplicationPackageArtifacts } from './application-package-artifacts.js';

const MAX_RESUME_TEXT = 60_000;

function safeResumeSource(run, session) {
  const result = run?.result;
  const resumeText = String(result?.resumeText || '');
  const expectedHash = String(result?.resumeSha256 || '');
  const actualHash = createHash('sha256').update(resumeText).digest('hex');
  const valid = run?.taskType === 'application_package'
    && run.status === 'Finished'
    && result?.documentVersion === session?.documentVersion
    && Array.isArray(result?.qa?.issues)
    && result.qa.issues.length === 0
    && resumeText.trim().length >= 200
    && resumeText.length <= MAX_RESUME_TEXT
    && /^[a-f0-9]{64}$/i.test(expectedHash)
    && actualHash === expectedHash.toLowerCase();
  if (!valid) throw new Error('GREENHOUSE_APPROVED_RESUME_NOT_READY');
  return { result, resumeText };
}

export async function buildTransientExtensionResume(run, session) {
  const { result, resumeText } = safeResumeSource(run, session);
  const built = await buildApplicationPackageArtifacts({
    employer: session.role?.employer,
    title: session.role?.title,
    documentVersion: session.documentVersion,
    resumeText,
    coverLetterText: '',
  });
  if (built.qa?.issues?.length || built.qa?.pdfTextExtracted !== true || ![1, 2].includes(Number(built.qa?.pageCount))) {
    throw new Error('GREENHOUSE_APPROVED_RESUME_NOT_READY');
  }
  const matches = (built.artifacts || []).filter(item => item?.key === 'resume_pdf');
  const artifact = matches.length === 1 ? matches[0] : null;
  const bytes = Buffer.from(String(artifact?.contentBase64 || ''), 'base64');
  const validArtifact = artifact?.contentType === 'application/pdf'
    && /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,178}\.pdf$/i.test(String(artifact.filename || ''))
    && bytes.length === Number(artifact.bytes)
    && bytes.length > 0
    && bytes.length <= 800_000
    && createHash('sha256').update(bytes).digest('hex') === artifact.sha256;
  if (!validArtifact) throw new Error('GREENHOUSE_APPROVED_RESUME_ARTIFACT_INVALID');
  return {
    artifact: { ...artifact, contentBase64: undefined },
    bytes,
    delivery: 'transient-reviewed-source',
    sourceResumeSha256: result.resumeSha256,
  };
}
