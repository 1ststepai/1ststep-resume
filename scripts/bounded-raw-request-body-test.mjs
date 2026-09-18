import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { isRequestBodyTooLarge, readBoundedRawRequestBody } from '../lib/bounded-raw-request-body.js';

function request(chunks, headers = {}) {
  const stream = Readable.from(chunks);
  stream.headers = headers;
  return stream;
}

const exact = await readBoundedRawRequestBody(request([Buffer.from('ab'), Buffer.from('cd')]), { limitBytes: 4 });
assert.deepEqual(exact, Buffer.from('abcd'), 'the accepted raw bytes must remain byte-for-byte identical');

await assert.rejects(
  readBoundedRawRequestBody(request([Buffer.alloc(3), Buffer.alloc(2)]), { limitBytes: 4 }),
  error => isRequestBodyTooLarge(error),
  'streamed bodies must be rejected as soon as the cumulative limit is crossed',
);

let consumed = false;
async function* oversizedDeclaredBody() { consumed = true; yield Buffer.from('x'); }
const declared = Readable.from(oversizedDeclaredBody());
declared.headers = { 'content-length': '5' };
await assert.rejects(readBoundedRawRequestBody(declared, { limitBytes: 4 }), error => isRequestBodyTooLarge(error));
assert.equal(consumed, false, 'oversized Content-Length must be rejected before reading the stream');

for (const file of ['api/stripe-webhook.js', 'api/tally-webhook.js']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /readBoundedRawRequestBody\(req,/, `${file} must use the bounded reader`);
  assert.match(source, /status\(413\)/, `${file} must return 413 for oversized requests`);
}

console.log('bounded raw request body regression tests passed');
