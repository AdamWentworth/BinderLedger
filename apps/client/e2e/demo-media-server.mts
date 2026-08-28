import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { extname, relative, resolve } from 'node:path';

import {
  parseCaptureAPIOrigin,
  resolveCaptureProxyRequest,
  type CaptureProxyRequest,
} from '../src/lib/demo-media-proxy.mts';

const host = '127.0.0.1';
const port = Number(process.env.BINDERLEDGER_DEMO_MEDIA_PORT ?? 8084);
const staticRoot = resolve('dist');
const apiOrigin = parseCaptureAPIOrigin(requiredEnvironment('BINDERLEDGER_DEMO_MEDIA_API_URL'));
const maximumUpstreamBytes = 20 << 20;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('BINDERLEDGER_DEMO_MEDIA_PORT must be an integer from 1 through 65535.');
}

const server = createServer(async (request, response) => {
  try {
    const requestURL = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (requestURL.pathname.startsWith('/api/')) {
      const proxyRequest = resolveCaptureProxyRequest(
        request.method ?? 'GET',
        requestURL,
        apiOrigin,
      );
      if (proxyRequest.status === 'method-not-allowed') {
        methodNotAllowed(response);
        return;
      }
      if (proxyRequest.status === 'not-found') {
        notFound(response);
        return;
      }
      await proxyAPI(request.headers, response, proxyRequest);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      methodNotAllowed(response);
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

async function proxyAPI(
  requestHeaders: IncomingHttpHeaders,
  response: ServerResponse,
  proxyRequest: Extract<CaptureProxyRequest, { status: 'ok' }>,
) {
  const headers = new Headers();
  const accept = requestHeaders.accept;
  if (typeof accept === 'string' && accept.length <= 512) headers.set('accept', accept);

  const upstream = await fetch(proxyRequest.target, {
    headers,
    method: proxyRequest.method,
    redirect: 'manual',
  });
  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumUpstreamBytes) {
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end('Upstream response is too large');
    return;
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > maximumUpstreamBytes) {
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end('Upstream response is too large');
    return;
  }

  const responseHeaders: Record<string, string> = {
    'content-length': String(body.length),
  };
  for (const name of ['cache-control', 'content-type', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  response.writeHead(upstream.status, responseHeaders);
  response.end(proxyRequest.method === 'HEAD' ? undefined : body);
}

async function serveStatic(response: ServerResponse, pathname: string, headOnly: boolean) {
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

  notFound(response);
}

function methodNotAllowed(response: ServerResponse) {
  response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain' });
  response.end('Method not allowed');
}

function notFound(response: ServerResponse) {
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('Not found');
}

function contentType(filename: string) {
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

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
