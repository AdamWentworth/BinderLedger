import queryString from 'query-string';

// Preserve the namespace exports expected by Expo Router 57 while loading the
// patched ESM package pinned in package.json. The Metro resolver deliberately
// lets this file's own import resolve to the real package instead of this shim.
export const {
  exclude,
  extract,
  parse,
  parseUrl,
  pick,
  stringify,
  stringifyUrl,
} = queryString;

export default queryString;
