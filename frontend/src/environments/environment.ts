/**
 * Development environment.
 *
 * `apiUrl` is the only value the application reads at runtime. The previous
 * file also advertised WebSocket endpoints and feature flags for real-time
 * search and analytics — none of which existed in the code, and the backend
 * subsystem behind them has since been removed.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
} as const;
