const http = require('http');
const { Server } = require('socket.io');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { setupWebPubSubAdapter } = require('./webpubsub');
const { logger } = require('../telemetry');
const { v4: uuidv4 } = require('uuid');

class WebSocketServer {
  constructor(server, options = {}) {
    this.port = options.port || process.env.WS_PORT || 3002;
    this.server = server || http.createServer();
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.WS_CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      },
      ...options.socketIoOptions
    });
    
    this.clients = new Map();
    this.initializeMiddlewares();
    this.initializeHandlers();
    this.initializePubSub();
  }

  async initializePubSub() {
    if (process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING) {
      try {
        const serviceClient = new WebPubSubServiceClient(
          process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING,
          'hub'
        );
        
        this.pubsub = await setupWebPubSubAdapter(this.io, serviceClient);
        logger.info('Azure Web PubSub adapter initialized');
      } catch (error) {
        logger.error('Failed to initialize Azure Web PubSub', error);
      }
    } else {
      logger.warn('Azure Web PubSub connection string not found, running in standalone mode');
    }
  }

  initializeMiddlewares() {
    // Authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      const clientId = socket.handshake.query.clientId || uuidv4();
      
      if (process.env.REQUIRE_AUTH === 'true' && !token) {
        return next(new Error('Authentication error: Token is required'));
      }
      
      socket.clientId = clientId;
      this.clients.set(clientId, socket);
      
      next();
    });
  }

  initializeHandlers() {
    this.io.on('connection', (socket) => {
      const { clientId } = socket;
      logger.info(`Client connected: ${clientId}`, { 
        clientId,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });

      // Handle custom events
      socket.on('message', (data) => {
        logger.info('Message received', { 
          clientId,
          event: 'message',
          data,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
        
        // Broadcast to all clients except sender
        socket.broadcast.emit('message', {
          from: clientId,
          message: data.message,
          timestamp: new Date().toISOString()
        });
      });

      // Join room
      socket.on('join', (room) => {
        socket.join(room);
        logger.info(`Client ${clientId} joined room ${room}`, { 
          clientId, 
          room,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
      });

      // Leave room
      socket.on('leave', (room) => {
        socket.leave(room);
        logger.info(`Client ${clientId} left room ${room}`, { 
          clientId, 
          room,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
      });

      // Room message
      socket.on('room-message', ({ room, message }) => {
        logger.info('Room message received', { 
          clientId,
          room,
          message,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
        
        this.io.to(room).emit('room-message', {
          from: clientId,
          room,
          message,
          timestamp: new Date().toISOString()
        });
      });

      // Disconnect handler
      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected: ${clientId}`, { 
          clientId, 
          reason,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
        
        this.clients.delete(clientId);
      });

      // Error handler
      socket.on('error', (error) => {
        logger.error(`Socket error for client ${clientId}`, { 
          clientId, 
          error: error.message,
          stack: error.stack,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
      });
    });

    // Error handling for the server
    this.server.on('error', (error) => {
      logger.error('WebSocket server error', { 
        error: error.message,
        stack: error.stack,
        transport: 'websocket',
        storage_source: 'websocket-server'
      });
    });
  }

  broadcast(event, data) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
      transport: 'websocket',
      storage_source: 'websocket-server'
    });
  }

  sendToClient(clientId, event, data) {
    const socket = this.clients.get(clientId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
        transport: 'websocket',
        storage_source: 'websocket-server'
      });
      return true;
    }
    return false;
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`WebSocket server running on port ${this.port}`, {
          port: this.port,
          transport: 'websocket',
          storage_source: 'websocket-server'
        });
        resolve();
      });
    });
  }

  async stop() {
    // Close all client connections
    for (const [clientId, socket] of this.clients.entries()) {
      socket.disconnect(true);
      this.clients.delete(clientId);
    }

    // Close the server
    if (this.io) {
      this.io.close();
    }

    if (this.server) {
      this.server.close();
    }

    logger.info('WebSocket server stopped', {
      transport: 'websocket',
      storage_source: 'websocket-server'
    });
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new WebSocketServer();
  server.start().catch(error => {
    console.error('Failed to start WebSocket server:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down WebSocket server...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = WebSocketServer;
