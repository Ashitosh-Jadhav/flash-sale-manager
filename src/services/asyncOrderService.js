const { pool } = require('../config/database');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderQueueService = require('./orderQueueService');
const { NotFoundError, BadRequestError } = require('../utils/errors');

// ============================================
// Async Order Service (Redis Queue Version)
// ============================================
// WHY: This is the ASYNCHRONOUS version of our order flow.
// Instead of processing the order synchronously (locking rows,
// decrementing stock, waiting for MySQL), this service:
//
//   1. Validates the request
//   2. Creates a 'queued' order in MySQL (lightweight INSERT, no lock)
//   3. Pushes the order ID to Redis
//   4. Returns immediately with 202 Accepted
//
// The WORKER (separate process) will later:
//   1. Pull the job from Redis
//   2. Lock the product row
//   3. Decrement stock
//   4. Update order status to 'confirmed' or 'failed'
//
// The key insight: The API no longer waits for the slow part
// (row locking + stock decrement). It only does the fast part
// (validate + INSERT + LPUSH).

class AsyncOrderService {
  /**
   * Accept an order for asynchronous processing
   * Returns immediately after queueing — does NOT wait for stock check
   */
  static async acceptOrder(orderData, idempotencyKey) {
    const { productId, customerName, customerEmail, quantity } = orderData;

    // 1. Idempotency check (fast — uses an indexed unique column)
    if (idempotencyKey) {
      const existingOrder = await Order.findByIdempotencyKey(idempotencyKey);
      if (existingOrder) {
        return { order: existingOrder, isExisting: true };
      }
    }

    // 2. Quick validation — does the product exist? (no lock needed)
    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }

    // 3. Quick stock sanity check (non-locking, approximate)
    // This is NOT a guarantee — the worker will do the real check with FOR UPDATE.
    // This just prevents obviously invalid requests from clogging the queue.
    if (product.stock < quantity) {
      throw new BadRequestError(`Insufficient stock. Only ${product.stock} items available.`);
    }

    // 4. Flash sale timing check
    const now = new Date();
    if (product.flash_sale) {
      if (product.sale_start && now < new Date(product.sale_start)) {
        throw new BadRequestError('Flash sale has not started yet');
      }
      if (product.sale_end && now > new Date(product.sale_end)) {
        throw new BadRequestError('Flash sale has ended');
      }
    }

    // 5. DB-FIRST: Create order with status='queued' (no transaction needed — single INSERT)
    const totalPrice = parseFloat(product.price) * quantity;
    const connection = await pool.getConnection();
    let orderId;
    try {
      orderId = await Order.insert({
        productId,
        customerName,
        customerEmail,
        quantity,
        totalPrice,
        status: 'queued',
        idempotencyKey,
      }, connection);
    } finally {
      connection.release();
    }

    // 6. Push job to Redis queue
    try {
      await OrderQueueService.enqueue({
        orderId,
        productId,
        quantity,
      });
    } catch (redisError) {
      // If Redis push fails, the order is still in MySQL with status='queued'.
      // A sweep process or manual retry can pick it up later.
      // We do NOT delete the order — that would be worse.
      console.error(`[AsyncOrderService] Redis enqueue failed for order ${orderId}:`, redisError.message);
      // Still return the order — it's in the DB, just not queued yet
    }

    // 7. Return immediately — order is queued, not confirmed
    return {
      order: {
        id: orderId,
        productId,
        customerName,
        customerEmail,
        quantity,
        totalPrice,
        status: 'queued',
        idempotencyKey,
      },
      isExisting: false,
    };
  }
}

module.exports = AsyncOrderService;
