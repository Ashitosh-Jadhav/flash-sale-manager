const { createRedisClient, QUEUE_NAME } = require('../config/redis');

// ============================================
// Order Queue Service (Redis Producer)
// ============================================
// WHY: This module is the PRODUCER. It pushes order jobs
// into the Redis queue. The Express API calls this instead
// of directly processing orders through MySQL.
//
// DESIGN DECISION — "DB-first" approach:
// 1. Create the order in MySQL with status='queued' FIRST
// 2. Push the order ID to Redis SECOND
//
// Why DB-first?
// - If Redis push fails, we still have the order in MySQL (status='queued')
//   and can retry or have a sweep process pick it up later.
// - If we did Redis-first and the DB insert failed, we'd have a phantom
//   job in Redis with no corresponding database record.
// - The order in MySQL acts as the "source of truth." Redis is just
//   the transport mechanism.

const redis = createRedisClient('producer');

class OrderQueueService {
  /**
   * Push an order job into the Redis queue
   * @param {Object} jobData - The job payload
   * @returns {number} Queue length after push
   */
  static async enqueue(jobData) {
    const message = JSON.stringify({
      orderId: jobData.orderId,
      productId: jobData.productId,
      quantity: jobData.quantity,
      enqueuedAt: Date.now(),
    });

    // LPUSH adds to the LEFT (head) of the list.
    // Worker uses BRPOP on the RIGHT (tail) = FIFO order.
    const queueLength = await redis.lpush(QUEUE_NAME, message);
    return queueLength;
  }

  /**
   * Get the current queue depth (for observability)
   */
  static async getQueueDepth() {
    return await redis.llen(QUEUE_NAME);
  }

  /**
   * Gracefully close the producer connection
   */
  static async shutdown() {
    await redis.quit();
  }
}

module.exports = OrderQueueService;
