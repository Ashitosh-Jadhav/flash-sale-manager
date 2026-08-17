const { pool } = require('../config/database');

// ============================================
// User Model (Repository Pattern)
// ============================================
// WHY: Centralizes all SQL queries related to users.
// Controllers and services call these methods instead
// of writing raw SQL, keeping the codebase modular.

class User {
  /**
   * Create a new user
   * @param {Object} userData - { name, email, passwordHash, role }
   * @returns {number} The ID of the newly created user
   */
  static async create(userData) {
    const { name, email, passwordHash, role } = userData;
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role || 'customer']
    );
    return result.insertId;
  }

  /**
   * Find a user by email (used during login)
   * @param {string} email
   * @returns {Object|null} The full user row INCLUDING password_hash
   */
  static async findByEmail(email) {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0] || null;
  }

  /**
   * Find a user by ID (used after JWT decode)
   * @param {number} id
   * @returns {Object|null} User WITHOUT password_hash
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }
}

module.exports = User;
