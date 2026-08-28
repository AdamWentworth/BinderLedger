import { describe, expect, it } from 'vitest';

import { parseCaptureAPIOrigin, resolveCaptureProxyRequest } from './demo-media-proxy.mts';

const apiOrigin = parseCaptureAPIOrigin('http://192.0.2.10:4000');
const captureOrigin = 'http://127.0.0.1:8084';

describe('parseCaptureAPIOrigin', () => {
  it('accepts a bare HTTP or HTTPS origin', () => {
    expect(parseCaptureAPIOrigin('https://api.example.test').href).toBe(
      'https://api.example.test/',
    );
  });

  it.each([
    'file:///tmp/catalog.json',
    'http://user:password@api.example.test',
    'https://api.example.test/internal',
    'https://api.example.test/?target=internal',
    'https://api.example.test/#internal',
  ])('rejects unsafe API origin %s', (value) => {
    expect(() => parseCaptureAPIOrigin(value)).toThrow();
  });
});

describe('resolveCaptureProxyRequest', () => {
  it('rebuilds an approved read request against the configured origin', () => {
    const result = resolveCaptureProxyRequest(
      'GET',
      new URL('/api/catalog/listings?condition=Near+Mint&limit=24&offset=0', captureOrigin),
      apiOrigin,
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.method).toBe('GET');
    expect(result.target.origin).toBe(apiOrigin.origin);
    expect(result.target.pathname).toBe('/api/catalog/listings');
    expect(result.target.searchParams.get('condition')).toBe('Near Mint');
  });

  it('allows approved dynamic image and history paths', () => {
    const image = resolveCaptureProxyRequest(
      'HEAD',
      new URL('/api/catalog/images/card--unlimited--normal--english.jpg', captureOrigin),
      apiOrigin,
    );
    const history = resolveCaptureProxyRequest(
      'GET',
      new URL('/api/market/variants/variant_123/history?period=1m', captureOrigin),
      apiOrigin,
    );

    expect(image.status).toBe('ok');
    expect(history.status).toBe('ok');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects the mutation method %s', (method) => {
    expect(
      resolveCaptureProxyRequest(method, new URL('/api/catalog/cards', captureOrigin), apiOrigin),
    ).toEqual({ status: 'method-not-allowed' });
  });

  it.each([
    '/api/watchlists/default/cards',
    '/api/scans',
    '/api/catalog/images/..%2Fsecret.jpg',
    '/api/market/variants/..%2Fwatchlists/history',
    '/api//attacker.example.test',
  ])('rejects the unapproved or malformed path %s', (pathname) => {
    expect(
      resolveCaptureProxyRequest('GET', new URL(pathname, captureOrigin), apiOrigin),
    ).toEqual({ status: 'not-found' });
  });

  it('rejects unexpected, duplicate, and oversized query parameters', () => {
    const requests = [
      '/api/catalog/cards?target=http://169.254.169.254/',
      '/api/catalog/cards?limit=24&limit=100',
      `/api/catalog/cards?q=${'a'.repeat(513)}`,
    ];

    for (const request of requests) {
      expect(
        resolveCaptureProxyRequest('GET', new URL(request, captureOrigin), apiOrigin),
      ).toEqual({ status: 'not-found' });
    }
  });
});
