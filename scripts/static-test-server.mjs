import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4175);
const deploymentConfiguration = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
]);

function routeHeaders(pathname) {
  const headers = {};
  for (const rule of deploymentConfiguration.headers || []) {
    if (rule.source !== pathname) continue;
    for (const header of rule.headers || []) headers[header.key] = header.value;
  }
  return headers;
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname.startsWith('/api/')) { response.writeHead(404, { 'Content-Type': 'application/json' }); return response.end('{"error":"Not configured in static browser fixture."}'); }
    const relative = pathname === '/concierge' || pathname === '/concierge/' ? 'concierge.html' : pathname === '/app' || pathname === '/app/' ? 'concierge.html' : pathname === '/app/resume' ? 'app.html' : pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (path !== root && !path.startsWith(`${root}${sep}`)) { response.writeHead(403); return response.end(); }
    if (!(await stat(path)).isFile()) throw new Error('not-file');
    const bytes = await readFile(path);
    response.writeHead(200, {
      'Content-Type': types.get(extname(path).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...routeHeaders(pathname === '/concierge/' ? '/concierge' : pathname),
    });
    return response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Static browser fixture ready on http://127.0.0.1:${port}`));
