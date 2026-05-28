/**
 * Returns the correct base URL for generating share links.
 *
 * Priority:
 *  1. BASE_URL env var (always wins — set this on Render/Railway)
 *  2. X-Forwarded-Proto header (set by Render, Railway, Nginx, etc.)
 *  3. req.protocol fallback (only reliable in local dev)
 */
function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol;
  return `${proto}://${req.get('host')}`;
}

module.exports = { getBaseUrl };
