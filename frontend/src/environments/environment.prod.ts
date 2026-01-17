export const environment = {
  production: true,
  apiUrl: 'https://api.nyelvszo.eu',
  appName: 'NyelvSzó',
  version: '2.2.0',
  websocketUrl: 'wss://api.nyelvszo.eu/ws',
  features: {
    realTimeSearch: true,
    websocket: true,
    analytics: true,
  },
  cache: {
    ttl: 900000,
    maxSize: 500,
  },
};
