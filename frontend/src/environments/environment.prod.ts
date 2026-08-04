/**
 * Production environment.
 *
 * The API is served from a different origin, so this value also decides which
 * requests carry the bearer token (see auth.interceptor.ts) and what the nginx
 * Content-Security-Policy must allow in `connect-src`.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.nyelvszo.eu',
} as const;
