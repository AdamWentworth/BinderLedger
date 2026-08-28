const maximumQueryValueLength = 512;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/;
const safeImageFilenamePattern = /^[a-z0-9][a-z0-9.-]{0,254}\.(?:jpe?g|png|webp)$/;

type ProxyRoute = {
  allowedQueryParameters: ReadonlySet<string>;
  pathname: string;
};

export type CaptureProxyRequest =
  | { status: 'method-not-allowed' }
  | { status: 'not-found' }
  | { method: 'GET' | 'HEAD'; status: 'ok'; target: URL };

const noQueryParameters = new Set<string>();

export function parseCaptureAPIOrigin(value: string): URL {
  const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('BINDERLEDGER_DEMO_MEDIA_API_URL must use http or https.');
  }
  if (origin.username || origin.password) {
    throw new Error('BINDERLEDGER_DEMO_MEDIA_API_URL must not contain credentials.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('BINDERLEDGER_DEMO_MEDIA_API_URL must be an origin without a path, query, or fragment.');
  }
  return new URL(origin.origin);
}

export function resolveCaptureProxyRequest(
  method: string,
  requestURL: URL,
  apiOrigin: URL,
): CaptureProxyRequest {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return { status: 'method-not-allowed' };
  }

  const route = captureProxyRoute(requestURL.pathname);
  if (!route) return { status: 'not-found' };

  const target = new URL(route.pathname, apiOrigin);
  const seenParameters = new Set<string>();
  for (const [name, value] of requestURL.searchParams) {
    if (
      !route.allowedQueryParameters.has(name) ||
      seenParameters.has(name) ||
      value.length > maximumQueryValueLength ||
      value.includes('\0')
    ) {
      return { status: 'not-found' };
    }
    seenParameters.add(name);
    target.searchParams.set(name, value);
  }

  return { method: normalizedMethod, status: 'ok', target };
}

function captureProxyRoute(pathname: string): ProxyRoute | null {
  switch (pathname) {
    case '/api/health':
      return { allowedQueryParameters: noQueryParameters, pathname };
    case '/api/catalog/sets':
      return { allowedQueryParameters: noQueryParameters, pathname };
    case '/api/catalog/cards':
      return {
        allowedQueryParameters: new Set(['limit', 'offset', 'q', 'set_id']),
        pathname,
      };
    case '/api/catalog/listings':
      return {
        allowedQueryParameters: new Set([
          'condition',
          'edition',
          'finish',
          'graded_only',
          'limit',
          'offset',
          'q',
          'set_id',
          'sort',
          'variant_id',
        ]),
        pathname,
      };
    case '/api/market/overview':
      return {
        allowedQueryParameters: new Set(['condition', 'edition', 'limit', 'period', 'rank', 'set_id']),
        pathname,
      };
    case '/api/market/movements':
      return {
        allowedQueryParameters: new Set([
          'condition',
          'direction',
          'edition',
          'limit',
          'offset',
          'period',
          'q',
          'rank',
          'set_id',
        ]),
        pathname,
      };
  }

  const setPricing = /^\/api\/catalog\/sets\/([^/]+)\/pricing$/.exec(pathname);
  if (setPricing) {
    const setID = safePathIdentifier(setPricing[1]);
    if (!setID) return null;
    return {
      allowedQueryParameters: new Set(['condition', 'edition', 'period']),
      pathname: `/api/catalog/sets/${encodeURIComponent(setID)}/pricing`,
    };
  }

  const variantHistory = /^\/api\/market\/variants\/([^/]+)\/history$/.exec(pathname);
  if (variantHistory) {
    const variantID = safePathIdentifier(variantHistory[1]);
    if (!variantID) return null;
    return {
      allowedQueryParameters: new Set(['period']),
      pathname: `/api/market/variants/${encodeURIComponent(variantID)}/history`,
    };
  }

  const image = /^\/api\/catalog\/images\/([^/]+)$/.exec(pathname);
  if (image) {
    const filename = decodePathSegment(image[1]);
    if (!filename || !safeImageFilenamePattern.test(filename)) return null;
    return {
      allowedQueryParameters: noQueryParameters,
      pathname: `/api/catalog/images/${encodeURIComponent(filename)}`,
    };
  }

  return null;
}

function safePathIdentifier(value: string): string | null {
  const decoded = decodePathSegment(value);
  return decoded && safeIdentifierPattern.test(decoded) ? decoded : null;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
