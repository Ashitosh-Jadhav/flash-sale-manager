const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { createRedisClient, QUEUE_NAME, DEAD_LETTER_QUEUE } = require('../config/redis');
const { pool } = require('../config/database');
const Product = require('../models/Product');
const Order = require('../models/Order');
const logger = require('../utils/logger');
const http = require('http');
const client = require('prom-client');

// Worker metrics
const workerRegister = new client.Registry();
client.collectDefaultMetrics({ register: workerRegister, prefix: 'nodejs_', labels: { instance: 'worker' } });

const workerJobDuration = new client.Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Time to process a single worker job',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [workerRegister],
});
const workerJobsTotal = new client.Counter({
  name: 'worker_jobs_processed_total',
  help: 'Total jobs processed by the worker',
  labelNames: ['status'],
  registers: [workerRegister],
});
const workerQueueDepth = new client.Gauge({
  name: 'worker_queue_depth',
  help: 'Number of jobs in the order queue',
  registers: [workerRegister],
});

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
  logger.info('Processing order', { orderId, productId, quantity });
  const jobStart = process.hrtime.bigint();

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
      logger.warn('Order failed: product not found', { orderId, productId });
      workerJobsTotal.inc({ status: 'failed' });
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
      logger.warn('Order failed: insufficient stock', { orderId, stock: product.stock, requested: quantity });
      workerJobsTotal.inc({ status: 'failed' });
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
      logger.warn('Order failed: stock decrement failed', { orderId });
      workerJobsTotal.inc({ status: 'failed' });
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
    const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
    workerJobDuration.observe(durationSec);
    workerJobsTotal.inc({ status: 'confirmed' });
    logger.info('Order confirmed', { orderId, jobsProcessed, jobsFailed, durationMs: Math.round(durationSec * 1000) });

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
  logger.info('Worker starting', { queue: QUEUE_NAME });

  // Start a tiny HTTP server so Prometheus can scrape worker metrics.
  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        const depth = await redis.llen(QUEUE_NAME);
        workerQueueDepth.set(depth);
      } catch (e) { /* ignore */ }
      res.setHeader('Content-Type', workerRegister.contentType);
      res.end(await workerRegister.metrics());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  metricsServer.listen(9091, () => {
    logger.info('Worker metrics server listening', { port: 9091 });
  });

  while (!isShuttingDown) {
    try {
      const result = await redis.brpop(QUEUE_NAME, 5);

      if (result) {
        const [, message] = result;
        await processJob(message);
      }
    } catch (error) {
      if (!isShuttingDown) {
        logger.error('Worker main loop error', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  logger.info('Worker shutting down gracefully');
  metricsServer.close();
  await redis.quit();
  await pool.end();
  logger.info('Worker shutdown complete');
  process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => { isShuttingDown = true; });

startWorker();

