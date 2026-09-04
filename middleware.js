const NOT_FOUND_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
});

export default function middleware() {
  return new Response('Not found', {
    status: 404,
    headers: NOT_FOUND_HEADERS,
  });
}

export const config = {
  matcher: [
    '/lib/:path*',
    '/scripts/:path*',
    '/docs/:path*',
    '/dist/:path*',
    '/1ststep-extension/:path*',
    '/test-results/:path*',
    '/DESIGN.md',
    '/.gitattributes',
  ],
};
