const WebSocket = require('ws');

async function testWebSocketConnection() {
  console.log('🔌 Connecting to WebSocket server...');
  
  const ws = new WebSocket('ws://localhost:3001/ws');
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    
    // Send heartbeat message
    const heartbeatMessage = {
      type: 'heartbeat',
      payload: {}
    };
    
    console.log('📤 Sending heartbeat message...');
    ws.send(JSON.stringify(heartbeatMessage));
    
    // Test authentication with mock token
    setTimeout(() => {
      fetch('http://localhost:3001/api/auth/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(res => res.json())
      .then(data => {
        console.log('🔐 Authentication token received:', data.token.substring(0, 50) + '...');
        
        const authMessage = {
          type: 'auth',
          payload: {
            token: data.token
          }
        };
        
        console.log('📤 Sending authentication message...');
        ws.send(JSON.stringify(authMessage));
        
        // Test subscription
        setTimeout(() => {
          const subscribeMessage = {
            type: 'subscribe',
            payload: {
              channels: ['entries:public', 'search:suggestions']
            }
          };
          
          console.log('📤 Sending subscription message...');
          ws.send(JSON.stringify(subscribeMessage));
          
          // Test real-time search
          setTimeout(() => {
            const searchMessage = {
              type: 'search',
              payload: {
                query: 'alma',
                options: {}
              }
            };
            
            console.log('📤 Sending search message...');
            ws.send(JSON.stringify(searchMessage));
            
          }, 1000);
        }, 1000);
      })
      .catch(err => {
        console.error('❌ Auth request failed:', err.message);
      });
    }, 1000);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('📨 Received:', message.type, JSON.stringify(message.payload).substring(0, 100) + (JSON.stringify(message.payload).length > 100 ? '...' : ''));
    } catch (error) {
      console.log('📨 Received (raw):', data.toString());
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log('🔌 WebSocket closed:', code, reason.toString());
    process.exit(0);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    process.exit(1);
  });
  
  // Close after 10 seconds
  setTimeout(() => {
    console.log('⏰ Test completed, closing connection...');
    ws.close();
  }, 10000);
}

// Polyfill fetch for Node.js if not available
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

testWebSocketConnection().catch(console.error);
