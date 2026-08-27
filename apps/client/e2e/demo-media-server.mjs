import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.BINDERLEDGER_DEMO_MEDIA_PORT ?? 8084);
const staticRoot = resolve('dist');
const apiOrigin = new URL(requiredEnvironment('BINDERLEDGER_DEMO_MEDIA_API_URL'));

if (!['http:', 'https:'].includes(apiOrigin.protocol)) {
  throw new Error('BINDERLEDGER_DEMO_MEDIA_API_URL must use http or https.');
}

const server = createServer(async (request, response) => {
  try {
    const requestURL = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (requestURL.pathname.startsWith('/api/')) {
      await proxyAPI(request, response, requestURL);
      return;
    }
    await serveStatic(response, requestURL.pathname, request.method === 'HEAD');
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
    response.end('Capture server error');
  }
});

server.listen(port, host, () => {
  console.log(`BinderLedger capture server listening at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function proxyAPI(request, response, requestURL) {
  const target = new URL(`${requestURL.pathname}${requestURL.search}`, apiOrigin);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (!value || ['connection', 'content-length', 'host'].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  const upstream = await fetch(target, {
    body: ['GET', 'HEAD'].includes(request.method ?? 'GET') ? undefined : await requestBody(request),
    headers,
    method: request.method,
    redirect: 'manual',
  });
  const responseHeaders = Object.fromEntries(
    [...upstream.headers.entries()].filter(
      ([name]) => !['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(name),
    ),
  );
  const body = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, { ...responseHeaders, 'content-length': String(body.length) });
  response.end(body);
}

async function serveStatic(response, pathname, headOnly) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const candidates = extname(relativePath)
    ? [relativePath]
    : [`${relativePath}.html`, `${relativePath}/index.html`];

  for (const candidate of candidates) {
    const filename = resolve(staticRoot, candidate);
    const localPath = relative(staticRoot, filename);
    if (localPath.startsWith('..') || resolve(staticRoot, localPath) !== filename) continue;
    const metadata = await stat(filename).catch(() => null);
    if (!metadata?.isFile()) continue;

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': String(metadata.size),
      'content-type': contentType(filename),
    });
    if (headOnly) {
      response.end();
      return;
    }
    createReadStream(filename).pipe(response);
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('Not found');
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function contentType(filename) {
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }[extname(filename).toLowerCase()] ?? 'application/octet-stream'
  );
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
