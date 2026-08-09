const mysql = require('mysql2/promise');
const config = require('./index');

// ============================================
// MySQL Connection Pool Setup
// ============================================
// WHY: We create a connection pool rather than a single connection.
// A pool maintains multiple active connections (e.g., 10) to the DB.
// When an HTTP request comes in, it borrows a connection from the pool,
// runs its query, and returns the connection.
// This eliminates the 20-50ms overhead of establishing a new connection
// for every single order during a flash sale.

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
});

// Utility function to test the database connection on startup.
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully!');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error.message);
    // If the database is required for the app to function, we might exit the process here.
  }
};

module.exports = {
  pool,
  testConnection,
};
