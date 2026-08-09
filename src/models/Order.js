const { pool } = require('../config/database');

// ============================================
// Order Model
// ============================================
// WHY: We use the Repository Pattern for Orders as well.
// Centralizing SQL queries ensures consistency and prevents bugs
// across different endpoints (e.g., placing an order, fetching order status).

class Order {
  /**
   * Insert a new order record into the database (Transactional)
   * @param {Object} orderData 
   * @param {Object} connection - MySQL connection object from the pool
   * @returns {number} The ID of the newly created order
   */
  static async insert(orderData, connection) {
    const { productId, customerName, customerEmail, quantity, totalPrice, status, idempotencyKey } = orderData;
    
    // We add idempotency_key to the insert statement
    const [result] = await connection.execute(
      'INSERT INTO orders (product_id, customer_name, customer_email, quantity, total_price, status, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [productId, customerName, customerEmail, quantity, totalPrice, status || 'pending', idempotencyKey || null]
    );
    
    return result.insertId;
  }

  /**
   * Find an order by its idempotency key
   * @param {string} key 
   * @returns {Object|null} The order or null if not found
   */
  static async findByIdempotencyKey(key) {
    const [rows] = await pool.execute('SELECT * FROM orders WHERE idempotency_key = ?', [key]);
    return rows[0] || null;
  }

  /**
   * Find all orders
   * @returns {Array} List of orders
   */
  static async findAll() {
    const [rows] = await pool.execute('SELECT * FROM orders ORDER BY id DESC');
    return rows;
  }

  /**
   * Find an order by its ID
   * @param {number} id 
   * @returns {Object|null} The order or null if not found
   */
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0] || null;
  }
}

module.exports = Order;
