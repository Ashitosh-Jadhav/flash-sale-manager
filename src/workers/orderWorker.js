const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { createRedisClient, QUEUE_NAME, DEAD_LETTER_QUEUE } = require('../config/redis');
const { pool } = require('../config/database');
const Product = require('../models/Product');
const Order = require('../models/Order');

// ============================================
// Order Worker (Redis Consumer)
// ============================================
// WHY this is a SEPARATE PROCESS from Express:
//
// 1. Express handles HTTP traffic (fast, non-blocking).
//    The worker handles MySQL transactions (slow, blocking).
//    Mixing them means slow DB work blocks HTTP responses.
//
// 2. If the worker crashes, the API stays up. Users can still
//    submit orders (they queue in Redis). When the worker
//    restarts, it processes the backlog.
//
// 3. We can scale workers independently. Need more DB throughput?
//    Add more workers. Need more API throughput? Add more Express
//    instances. They scale separately.
//
// HOW IT WORKS:
// 1. Worker calls BRPOP on the Redis queue (blocking pop).
// 2. BRPOP waits until a message appears (no polling, no CPU waste).
// 3. When a message arrives, the worker processes it:
//    a. Parse the job
//    b. Begin MySQL transaction
//    c. SELECT ... FOR UPDATE on the product row
//    d. Check stock
//    e. Decrement stock
//    f. Update order status to 'confirmed' or 'failed'
//    g. COMMIT
// 4. Loop back to step 1.

const redis = createRedisClient('worker');

let isShuttingDown = false;
let jobsProcessed = 0;
let jobsFailed = 0;

async function processJob(rawMessage) {
  let job;
  try {
    job = JSON.parse(rawMessage);
  } catch (parseError) {
    console.error('[Worker] Failed to parse job:', rawMessage);
    // Poison message — push to dead letter queue
    const dlqRedis = createRedisClient('dlq');
    await dlqRedis.lpush(DEAD_LETTER_QUEUE, rawMessage);
    await dlqRedis.quit();
    jobsFailed++;
    return;
  }

  const { orderId, productId, quantity } = job;
  console.log(`[Worker] Processing order #${orderId} (product: ${productId}, qty: ${quantity})`);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the product row
    const product = await Product.findByIdForUpdate(productId, connection);

    if (!product) {
      // Product was deleted between queueing and processing
      await connection.execute(
        'UPDATE orders SET status = ? WHERE id = ?',
        ['failed', orderId]
      );
      await connection.commit();
      console.log(`[Worker] Order #${orderId} FAILED: Product ${productId} not found`);
      jobsFailed++;
      return;
    }

    // 2. Check stock (the REAL check, with the row locked)
    if (product.stock < quantity) {
      await connection.execute(
        'UPDATE orders SET status = ? WHERE id = ?',
        ['failed', orderId]
      );
      await connection.commit();
      console.log(`[Worker] Order #${orderId} FAILED: Insufficient stock (${product.stock} < ${quantity})`);
      jobsFailed++;
      return;
    }

    // 3. Decrement stock
    const stockUpdated = await Product.decrementStock(productId, quantity, connection);
    if (!stockUpdated) {
      await connection.execute(
        'UPDATE orders SET status = ? WHERE id = ?',
        ['failed', orderId]
      );
      await connection.commit();
      console.log(`[Worker] Order #${orderId} FAILED: Stock decrement failed`);
      jobsFailed++;
      return;
    }

    // 4. Update order status to confirmed
    await connection.execute(
      'UPDATE orders SET status = ? WHERE id = ?',
      ['confirmed', orderId]
    );

    await connection.commit();
    jobsProcessed++;
    console.log(`[Worker] Order #${orderId} CONFIRMED ✓ (processed: ${jobsProcessed}, failed: ${jobsFailed})`);

  } catch (error) {
    await connection.rollback();

    // Check if this is a duplicate processing attempt (idempotent worker)
    // The order might already be confirmed by another worker instance
    const existingOrder = await Order.findById(orderId);
    if (existingOrder && existingOrder.status === 'confirmed') {
      console.log(`[Worker] Order #${orderId} already confirmed (idempotent skip)`);
      return;
    }

    // Mark as failed
    try {
      await pool.execute('UPDATE orders SET status = ? WHERE id = ?', ['failed', orderId]);
    } catch (updateError) {
      console.error(`[Worker] Failed to mark order #${orderId} as failed:`, updateError.message);
    }

    console.error(`[Worker] Order #${orderId} ERROR:`, error.message);
    jobsFailed++;
  } finally {
    connection.release();
  }
}

async function startWorker() {
  console.log('='.repeat(50));
  console.log('  Flash Sale Worker');
  console.log('  Listening on queue:', QUEUE_NAME);
  console.log('='.repeat(50));

  while (!isShuttingDown) {
    try {
      // BRPOP: Blocking Right Pop
      // Waits up to 5 seconds for a message. If none arrives, returns null and loops.
      // This is NOT polling — Redis holds the connection open efficiently.
      // The 5-second timeout allows us to check isShuttingDown periodically.
      const result = await redis.brpop(QUEUE_NAME, 5);

      if (result) {
        // result = [queueName, message]
        const [, message] = result;
        await processJob(message);
      }
      // If result is null, BRPOP timed out — loop and try again
    } catch (error) {
      if (!isShuttingDown) {
        console.error('[Worker] Error in main loop:', error.message);
        // Wait 1 second before retrying to avoid tight error loops
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log('[Worker] Shutting down gracefully...');
  await redis.quit();
  await pool.end();
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });

startWorker();
