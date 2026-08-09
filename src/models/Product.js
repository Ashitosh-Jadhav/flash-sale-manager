const { pool } = require('../config/database');

// ============================================
// Product Model
// ============================================
// WHY: We use the Repository Pattern. All SQL queries for Products
// belong here. Our controllers will call these methods instead of
// writing raw SQL themselves. This keeps our code modular and testable.

class Product {
  /**
   * Insert a new product into the database
   * @param {Object} productData 
   * @returns {number} The ID of the newly created product
   */
  static async create(productData) {
    const { name, description, price, stock, flash_sale, sale_start, sale_end } = productData;
    
    // The ? placeholders protect against SQL Injection attacks.
    const sql = `
      INSERT INTO products (name, description, price, stock, flash_sale, sale_start, sale_end) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    // execute() returns an array where the first element is the result object
    const [result] = await pool.execute(sql, [
      name, 
      description || null, 
      price, 
      stock || 0, 
      flash_sale || false, 
      sale_start || null, 
      sale_end || null
    ]);
    
    return result.insertId;
  }

  /**
   * Find all products (with optional filtering)
   * @returns {Array} List of products
   */
  static async findAll() {
    const [rows] = await pool.execute('SELECT * FROM products ORDER BY id DESC');
    return rows;
  }

  /**
   * Find a single product by its ID
   * @param {number} id 
   * @returns {Object|null} The product or null if not found
   */
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Find product by ID and lock the row for update (Transactional)
   * @param {number} id 
   * @param {Object} connection - MySQL connection object from the pool
   * @returns {Object|null} The product or null if not found
   */
  static async findByIdForUpdate(id, connection) {
    const [rows] = await connection.execute(
      'SELECT * FROM products WHERE id = ? FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Decrement stock for a product (Transactional)
   * @param {number} id 
   * @param {number} quantity 
   * @param {Object} connection - MySQL connection object from the pool
   */
  static async decrementStock(id, quantity, connection) {
    const [result] = await connection.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
      [quantity, id, quantity]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Product;
