const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { logger } = require('../telemetry');

/**
 * Sets up the Azure Web PubSub adapter for Socket.IO
 * @param {Server} io - Socket.IO server instance
 * @param {WebPubSubServiceClient} serviceClient - Azure Web PubSub service client
 * @returns {Promise<Object>} The configured Web PubSub adapter
 */
async function setupWebPubSubAdapter(io, serviceClient) {
  try {
    // Get the Web PubSub connection string
    const connectionString = process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('AZURE_WEB_PUBSUB_CONNECTION_STRING is not set');
    }

    // Get the hub name or use 'default'
    const hubName = process.env.AZURE_WEB_PUBSUB_HUB_NAME || 'default';
    
    // Get the client access URL with a 1-hour expiration
    const token = await serviceClient.getClientAccessToken({
      roles: ['webpubsub.sendToGroup', 'webpubsub.joinLeaveGroup'],
      groups: ['*']
    });

    // Log the Web PubSub endpoint
    const endpoint = serviceClient.endpoint.replace(/\/$/, '');
    logger.info('Azure Web PubSub endpoint configured', {
      endpoint,
      hubName,
      transport: 'websocket',
      storage_source: 'webpubsub-adapter'
    });

    // Configure the Socket.IO adapter
    const { WebPubSubAdapter } = require('@azure/web-pubsub-socket.io');
    const adapter = new WebPubSubAdapter(serviceClient, {
      hub: hubName,
      skipNegotiate: true
    });

    // Attach the adapter to the Socket.IO server
    io.adapter(adapter);

    // Log successful initialization
    logger.info('Azure Web PubSub adapter initialized successfully', {
      hubName,
      transport: 'websocket',
      storage_source: 'webpubsub-adapter'
    });

    return {
      serviceClient,
      getClientUrl: () => token.url,
      broadcastToGroup: async (group, event, data) => {
        try {
          await serviceClient.sendToGroup(group, { event, data });
          logger.debug('Message broadcast to group', {
            group,
            event,
            dataLength: JSON.stringify(data)?.length,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
        } catch (error) {
          logger.error('Error broadcasting to group', {
            group,
            error: error.message,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
          throw error;
        }
      },
      addUserToGroup: async (userId, group) => {
        try {
          await serviceClient.addUserToGroup(group, userId);
          logger.debug('User added to group', {
            userId,
            group,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
        } catch (error) {
          logger.error('Error adding user to group', {
            userId,
            group,
            error: error.message,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
          throw error;
        }
      },
      removeUserFromGroup: async (userId, group) => {
        try {
          await serviceClient.removeUserFromGroup(group, userId);
          logger.debug('User removed from group', {
            userId,
            group,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
        } catch (error) {
          logger.error('Error removing user from group', {
            userId,
            group,
            error: error.message,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
          throw error;
        }
      },
      close: async () => {
        try {
          await serviceClient.close();
          logger.info('Web PubSub service client closed', {
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
        } catch (error) {
          logger.error('Error closing Web PubSub service client', {
            error: error.message,
            transport: 'websocket',
            storage_source: 'webpubsub-adapter'
          });
          throw error;
        }
      }
    };
  } catch (error) {
    logger.error('Failed to initialize Web PubSub adapter', {
      error: error.message,
      stack: error.stack,
      transport: 'websocket',
      storage_source: 'webpubsub-adapter'
    });
    throw error;
  }
}

module.exports = { setupWebPubSubAdapter };
