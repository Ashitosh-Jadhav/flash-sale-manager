const { pool } = require('../config/database');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { NotFoundError, BadRequestError, InsufficientStockError } = require('../utils/errors');

// ============================================
// Order Service (Business Logic Layer)
// ============================================

class OrderService {
  /**
   * Place an order with concurrency protection and idempotency
   */
  static async placeOrder(orderData, idempotencyKey) {
    const { productId, customerName, customerEmail, quantity } = orderData;

    // 1. Check Idempotency (Are we retrying the exact same request?)
    if (idempotencyKey) {
      const existingOrder = await Order.findByIdempotencyKey(idempotencyKey);
      if (existingOrder) {
        // Return the existing order instead of creating a duplicate
        return existingOrder;
      }
    }

    // Acquire a dedicated connection for the transaction
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 2. Fetch product and lock the row
      const product = await Product.findByIdForUpdate(productId, connection);

      if (!product) {
        throw new NotFoundError(`Product with ID ${productId} not found`);
      }

      // 3. Flash Sale Active Check (Business Rule)
      const now = new Date();
      if (product.flash_sale) {
        if (product.sale_start && now < new Date(product.sale_start)) {
          throw new BadRequestError('Flash sale has not started yet');
        }
        if (product.sale_end && now > new Date(product.sale_end)) {
          throw new BadRequestError('Flash sale has ended');
        }
      }

      // 4. Stock Validation
      if (product.stock < quantity) {
        throw new InsufficientStockError(`Only ${product.stock} items left in stock`);
      }

      // 5. Decrement Stock
      const stockUpdated = await Product.decrementStock(productId, quantity, connection);
      if (!stockUpdated) {
        // This is a safety net in case stock changed unexpectedly
        throw new InsufficientStockError('Failed to decrement stock due to concurrent updates');
      }

      // 6. Create Order
      const totalPrice = parseFloat(product.price) * quantity;
      
      const insertData = {
        productId,
        customerName,
        customerEmail,
        quantity,
        totalPrice,
        status: 'confirmed', // Initial state
        idempotencyKey
      };

      const orderId = await Order.insert(insertData, connection);

      await connection.commit();

      return {
        id: orderId,
        ...insertData
      };
    } catch (error) {
      // 7. Handle Duplicate Idempotency Key Race Condition
      // If two requests with the same key execute at the EXACT same time,
      // the first one commits, the second one might throw a duplicate key error
      // when it tries to insert into the orders table.
      if (error.code === 'ER_DUP_ENTRY' && idempotencyKey) {
        await connection.rollback();
        const existingOrder = await Order.findByIdempotencyKey(idempotencyKey);
        return existingOrder;
      }

      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Order State Machine: Safely transition an order's status
   */
  static async updateOrderStatus(orderId, newStatus) {
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      queued: ['processing', 'confirmed', 'failed', 'cancelled'],
      processing: ['confirmed', 'failed'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [], // Terminal state
      cancelled: [], // Terminal state
      failed: ['queued'], // Can be retried
    };

    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const currentStatus = order.status;
    const allowedNextStates = validTransitions[currentStatus];

    if (!allowedNextStates || !allowedNextStates.includes(newStatus)) {
      throw new BadRequestError(`Invalid state transition from ${currentStatus} to ${newStatus}`);
    }

    // We don't have an updateStatus method in the model yet, so we execute it here.
    // In a real app, this would be in Order.updateStatus(orderId, newStatus)
    await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);

    return { ...order, status: newStatus };
  }
}

module.exports = OrderService;
