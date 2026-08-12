// cookie-utils.js
// Pure function, no browser/network dependency - easy to unit test.

/**
 * Turn a raw "Cookie:" header value (e.g. copied from browser DevTools) into
 * the array of cookie objects Playwright's context.addCookies() expects.
 *
 * "foo=bar; baz=qux"  ->  [{name:'foo', value:'bar', domain, path:'/'}, ...]
 */
function parseCookieHeader(headerStr, domain) {
  return (headerStr || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!name) return null;
      return { name, value, domain, path: '/' };
    })
    .filter(Boolean);
}

module.exports = { parseCookieHeader };
