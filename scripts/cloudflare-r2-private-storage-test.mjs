import assert from 'node:assert/strict';
import { cloudflareR2Configuration, createCloudflareR2BlobClient } from '../lib/cloudflare-r2-private-storage.js';
import { jobAgentObjectStorageConfiguration } from '../lib/job-agent-object-storage.js';

assert.equal(cloudflareR2Configuration({}).ready, false);

const calls = [];
const service = {
  async send(command) {
    calls.push(command);
    if (command.constructor.name === 'GetObjectCommand') return { Body: new Blob([Buffer.from('encrypted')]).stream() };
    if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [{ Key: 'tenant/a.bin' }], IsTruncated: false };
    return {};
  },
};
const client = createCloudflareR2BlobClient({ service, bucket: 'job-agent-private' });
await client.put('tenant/a.bin', Buffer.from('ciphertext'), { contentType: 'application/octet-stream', allowOverwrite: false });
const put = calls.at(-1).input;
assert.equal(put.Bucket, 'job-agent-private');
assert.equal(put.IfNoneMatch, '*');
assert.equal(put.ACL, undefined, 'No public ACL may be attached to candidate objects.');
const result = await client.get('tenant/a.bin');
assert.equal(result.statusCode, 200);
assert.equal(Buffer.from(await new Response(result.stream).arrayBuffer()).toString(), 'encrypted');
assert.deepEqual(await client.list({ prefix: 'tenant/' }), { blobs: [{ pathname: 'tenant/a.bin' }], hasMore: false, cursor: undefined });
await client.del(['tenant/a.bin']);
assert.equal(calls.at(-1).constructor.name, 'DeleteObjectsCommand');

let options;
const configured = cloudflareR2Configuration({
  CLOUDFLARE_R2_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'access_fixture_1234',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 's'.repeat(40),
  CLOUDFLARE_R2_BUCKET: 'job-agent-private',
}, value => { options = value; return service; });
assert.equal(configured.ready, true);
assert.equal(options.endpoint, `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`);
assert.equal(options.region, 'auto');

const selected = jobAgentObjectStorageConfiguration({
  JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true',
  JOB_AGENT_OBJECT_STORAGE_PROVIDER: 'cloudflare-r2',
  CLOUDFLARE_R2_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'access_fixture_1234',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 's'.repeat(40),
  CLOUDFLARE_R2_BUCKET: 'job-agent-private',
});
assert.equal(selected.mode, 'cloudflare-r2-private');
assert.equal(selected.ready, true);
const productionDisabled = jobAgentObjectStorageConfiguration({ VERCEL_ENV: 'production' });
assert.equal(productionDisabled.ready, false);
assert.equal(productionDisabled.reason, 'OBJECT_STORAGE_DISABLED');

console.log('Cloudflare R2 adapter is private-by-construction, overwrite-safe, and credential-gated.');
