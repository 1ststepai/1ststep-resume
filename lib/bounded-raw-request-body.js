export class RequestBodyTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Request body exceeds the ${limitBytes}-byte limit.`);
    this.name = 'RequestBodyTooLargeError';
    this.code = 'REQUEST_BODY_TOO_LARGE';
    this.statusCode = 413;
  }
}

export async function readBoundedRawRequestBody(req, { limitBytes }) {
  const limit = Number(limitBytes);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('A positive request body limit is required.');

  const declaredLength = Number(req?.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new RequestBodyTooLargeError(limit);

  const chunks = [];
  let totalBytes = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    totalBytes += chunk.length;
    if (totalBytes > limit) throw new RequestBodyTooLargeError(limit);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

export function isRequestBodyTooLarge(error) {
  return error?.code === 'REQUEST_BODY_TOO_LARGE';
}
