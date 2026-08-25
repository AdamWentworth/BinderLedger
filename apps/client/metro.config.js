const http = require('node:http');
const https = require('node:https');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const apiTarget = process.env.EXPO_PUBLIC_API_URL;

if (apiTarget) {
  const target = new URL(apiTarget);
  const enhanceMiddleware = config.server.enhanceMiddleware;

  config.server.enhanceMiddleware = (middleware, metroServer) => {
    const defaultMiddleware = enhanceMiddleware
      ? enhanceMiddleware(middleware, metroServer)
      : middleware;

    return (request, response, next) => {
      if (!request.url?.startsWith('/api/')) {
        return defaultMiddleware(request, response, next);
      }

      const upstreamURL = new URL(request.url, target);
      const headers = { ...request.headers, host: target.host };
      const transport = upstreamURL.protocol === 'https:' ? https : http;
      const upstreamRequest = transport.request(
        upstreamURL,
        { method: request.method, headers },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );

      upstreamRequest.on('error', (error) => {
        if (!response.headersSent) {
          response.writeHead(502, { 'Content-Type': 'application/json' });
        }
        response.end(JSON.stringify({ error: `API proxy failed: ${error.message}` }));
      });
      request.pipe(upstreamRequest);
    };
  };
}

module.exports = config;
