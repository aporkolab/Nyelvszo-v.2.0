



export const environment = {
  production: false, 
  apiUrl: 'http://localhost:3000', 
  appName: 'NyelvSzó',
  version: '2.2.0',
  websocketUrl: 'ws://localhost:3000/ws', 
  features: {
    realTimeSearch: true, 
    websocket: true, 
    analytics: false, 
  },
  cache: {
    ttl: 300000, 
    maxSize: 100, 
  },
};
