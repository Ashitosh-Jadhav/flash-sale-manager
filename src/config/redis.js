const Redis = require('ioredis');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ============================================
// Redis Configuration
// ============================================
// WHY a separate module: Same reason as database.js —
// every file that needs Redis imports from here.
// If we switch to a Redis cluster or change hosts,
// we change ONE file.
//
// WHY ioredis over 'redis' (node-redis):
// - Built-in reconnect with exponential backoff
// - Better TypeScript support
// - Cluster and Sentinel support out of the box
// - Used by Bull, BullMQ, and most production Node.js apps

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

/**
 * Create a new Redis client instance.
 * We use a factory function so the worker can have its own connection
 * separate from the API's connection.
 */
function createRedisClient(name = 'default') {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null, // Required for BullMQ-style blocking pops
    retryStrategy(times) {
      // Exponential backoff: wait 50ms, 100ms, 200ms, ... up to 2s
      const delay = Math.min(times * 50, 2000);
      console.log(`[Redis:${name}] Reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    lazyConnect: false,
  });

  client.on('connect', () => {
    console.log(`✅ Redis [${name}] connected to ${REDIS_HOST}:${REDIS_PORT}`);
  });

  client.on('error', (err) => {
    console.error(`❌ Redis [${name}] error:`, err.message);
  });

  client.on('close', () => {
    console.log(`🔌 Redis [${name}] connection closed`);
  });

  return client;
}

// Queue constants
const QUEUE_NAME = 'orders:pending';
const PROCESSING_QUEUE = 'orders:processing';
const DEAD_LETTER_QUEUE = 'orders:dead';

module.exports = {
  createRedisClient,
  QUEUE_NAME,
  PROCESSING_QUEUE,
  DEAD_LETTER_QUEUE,
};
