import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const ACCOUNT = /^[a-f0-9]{32}$/i;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function bodyStream(body) {
  if (body && typeof body.transformToWebStream === 'function') return body.transformToWebStream();
  if (body && typeof body.getReader === 'function') return body;
  if (body && typeof body[Symbol.asyncIterator] === 'function') return new Response(body).body;
  throw new Error('R2_OBJECT_BODY_INVALID');
}

export function cloudflareR2Configuration(env = process.env, createClient = options => new S3Client(options)) {
  const accountId = String(env.CLOUDFLARE_R2_ACCOUNT_ID || '');
  const accessKeyId = String(env.CLOUDFLARE_R2_ACCESS_KEY_ID || '');
  const secretAccessKey = String(env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '');
  const bucket = String(env.CLOUDFLARE_R2_BUCKET || '');
  if (!ACCOUNT.test(accountId) || accessKeyId.length < 16 || secretAccessKey.length < 32 || !BUCKET.test(bucket)) {
    return { ready: false, reason: 'R2_CREDENTIALS_MISSING' };
  }
  const service = createClient({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { ready: true, bucket, client: createCloudflareR2BlobClient({ service, bucket }) };
}

export function createCloudflareR2BlobClient({ service, bucket }) {
  if (!service || typeof service.send !== 'function' || !BUCKET.test(String(bucket || ''))) throw new Error('R2_CLIENT_INVALID');
  return {
    async put(pathname, bytes, options = {}) {
      await service.send(new PutObjectCommand({
        Bucket: bucket,
        Key: pathname,
        Body: bytes,
        ContentType: options.contentType || 'application/octet-stream',
        IfNoneMatch: options.allowOverwrite === false ? '*' : undefined,
      }));
      return { pathname };
    },
    async get(pathname) {
      try {
        const result = await service.send(new GetObjectCommand({ Bucket: bucket, Key: pathname }));
        return { statusCode: 200, stream: bodyStream(result.Body) };
      } catch (error) {
        const status = Number(error?.$metadata?.httpStatusCode || 0);
        if (status === 404 || error?.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async del(paths) {
      const keys = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
      if (!keys.length) return;
      for (let offset = 0; offset < keys.length; offset += 1000) {
        await service.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Quiet: true, Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })) },
        }));
      }
    },
    async list({ prefix, cursor, limit = 1000 }) {
      const result = await service.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: Math.max(1, Math.min(1000, Number(limit) || 1000)),
      }));
      return {
        blobs: (result.Contents || []).map(item => ({ pathname: String(item.Key || '') })).filter(item => item.pathname),
        hasMore: result.IsTruncated === true,
        cursor: result.NextContinuationToken,
      };
    },
  };
}
