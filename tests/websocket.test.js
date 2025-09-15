const { Server } = require('socket.io');
const { createServer } = require('http');
const WebSocketServer = require('../services/websocket/server');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { v4: uuidv4 } = require('uuid');

// Mock the Azure Web PubSub client
jest.mock('@azure/web-pubsub');

// Mock the logger
jest.mock('../services/telemetry', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

describe('WebSocket Server', () => {
  let httpServer;
  let io;
  let wsServer;
  let clientSocket;
  let clientSocket2;
  
  const testPort = 3002;
  const testClientId = 'test-client-' + uuidv4();
  const testRoom = 'test-room';
  
  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Create WebSocket server
    wsServer = new WebSocketServer(httpServer, {
      port: testPort,
      socketIoOptions: {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        }
      }
    });
    
    // Start the server
    httpServer.listen(testPort, () => {
      done();
    });
  });
  
  afterAll((done) => {
    // Clean up
    if (wsServer) {
      wsServer.stop().then(() => {
        if (httpServer) {
          httpServer.close(() => {
            done();
          });
        } else {
          done();
        }
      });
    } else if (httpServer) {
      httpServer.close(() => {
        done();
      });
    } else {
      done();
    }
  });
  
  beforeEach((done) => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup a client connection
    clientSocket = require('socket.io-client')(`http://localhost:${testPort}`, {
      query: {
        clientId: testClientId
      },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });
    
    // Wait for connection
    clientSocket.on('connect', () => {
      done();
    });
    
    // Handle connection errors
    clientSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      done.fail('Failed to connect to WebSocket server');
    });
  });
  
  afterEach((done) => {
    // Disconnect client after each test
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (clientSocket2 && clientSocket2.connected) {
      clientSocket2.disconnect();
    }
    done();
  });
  
  test('should connect to WebSocket server', (done) => {
    expect(clientSocket.connected).toBe(true);
    done();
  });
  
  test('should receive echo message', (done) => {
    const testMessage = 'Hello, WebSocket!';
    
    clientSocket.on('message', (data) => {
      try {
        expect(data.from).toBe(testClientId);
        expect(data.message).toBe(testMessage);
        done();
      } catch (error) {
        done(error);
      }
    });
    
    // Send a message that the server will echo back
    clientSocket.emit('message', { message: testMessage });
  });
  
  test('should join and leave a room', (done) => {
    clientSocket.emit('join', testRoom);
    
    // Need to wait a bit for the server to process the join
    setTimeout(() => {
      // Verify the client joined the room
      const rooms = Array.from(wsServer.io.sockets.adapter.rooms);
      const roomExists = rooms.some(([room]) => room === testRoom);
      expect(roomExists).toBe(true);
      
      // Now leave the room
      clientSocket.emit('leave', testRoom);
      
      setTimeout(() => {
        // Verify the client left the room
        const roomsAfterLeave = Array.from(wsServer.io.sockets.adapter.rooms);
        const roomStillExists = roomsAfterLeave.some(([room]) => room === testRoom);
        expect(roomStillExists).toBe(false);
        done();
      }, 100);
    }, 100);
  });
  
  test('should broadcast messages to room', (done) => {
    // Set up a second client
    clientSocket2 = require('socket.io-client')(`http://localhost:${testPort}`, {
      query: {
        clientId: 'test-client-2'
      },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });
    
    // Both clients join the test room
    clientSocket.emit('join', testRoom);
    clientSocket2.emit('join', testRoom);
    
    const testMessage = 'Room broadcast test';
    
    // Second client listens for room messages
    clientSocket2.on('room-message', (data) => {
      try {
        expect(data.room).toBe(testRoom);
        expect(data.message).toBe(testMessage);
        expect(data.from).toBe(testClientId);
        done();
      } catch (error) {
        done(error);
      }
    });
    
    // First client sends a message to the room
    setTimeout(() => {
      clientSocket.emit('room-message', {
        room: testRoom,
        message: testMessage
      });
    }, 100);
  });
  
  test('should handle disconnection', (done) => {
    clientSocket.on('disconnect', () => {
      // After disconnect, the client should be removed from the clients map
      setTimeout(() => {
        expect(wsServer.clients.has(testClientId)).toBe(false);
        done();
      }, 100);
    });
    
    clientSocket.disconnect();
  });
  
  test('should handle authentication', (done) => {
    // Test with invalid token when auth is required
    process.env.REQUIRE_AUTH = 'true';
    
    const unauthorizedClient = require('socket.io-client')(`http://localhost:${testPort}`, {
      query: {
        clientId: 'unauthorized-client'
      },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: {
        token: null // No token provided
      }
    });
    
    unauthorizedClient.on('connect_error', (error) => {
      try {
        expect(error.message).toContain('Authentication error');
        unauthorizedClient.close();
        process.env.REQUIRE_AUTH = ''; // Reset for other tests
        done();
      } catch (e) {
        done(e);
      }
    });
  });
  
  test('should initialize Web PubSub adapter when configured', async () => {
    // Mock the Web PubSub service client
    const mockServiceClient = {
      getClientAccessToken: jest.fn().mockResolvedValue({
        url: 'wss://test.webpubsub.azure.com/client/hubs/hub?access_token=test-token'
      })
    };
    
    // Mock the WebPubSubAdapter
    const mockAdapter = {
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    jest.mock('@azure/web-pubsub-socket.io', () => ({
      WebPubSubAdapter: jest.fn().mockImplementation(() => mockAdapter)
    }));
    
    // Set up the test server with Web PubSub
    process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING = 'Endpoint=test;AccessKey=test;Version=1.0;';
    
    const testServer = createServer();
    const testWsServer = new WebSocketServer(testServer, {
      port: 3003
    });
    
    // Mock the setupWebPubSubAdapter function
    const originalSetup = require('../services/websocket/webpubsub').setupWebPubSubAdapter;
    require('../services/websocket/webpubsub').setupWebPubSubAdapter = jest.fn()
      .mockResolvedValue({
        serviceClient: mockServiceClient,
        close: jest.fn().mockResolvedValue(undefined)
      });
    
    // Force re-import the server to apply the mock
    jest.resetModules();
    
    // Verify the Web PubSub adapter was initialized
    expect(require('../services/websocket/webpubsub').setupWebPubSubAdapter).toHaveBeenCalled();
    
    // Clean up
    await testWsServer.stop();
    testServer.close();
    
    // Restore the original function
    require('../services/websocket/webpubsub').setupWebPubSubAdapter = originalSetup;
    delete process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING;
  });
});
