// ============================================
// Server Entry Point (server.js)
// ============================================
// WHY this file exists:
// This is the ONLY file that starts the HTTP server.
// It imports the Express app from app.js and tells
// it to listen on a specific port.
//
// Think of it like this:
// - app.js = the restaurant's menu and kitchen
// - server.js = opening the front door to customers
//
// Keeping this separate means:
// 1. Tests can import app.js without opening the door
// 2. Serverless (AWS Lambda) can use app.js directly
// 3. We can add graceful shutdown logic here later
// ============================================

// Import our centralized config (reads .env via dotenv)
const config = require('./config');

// Import the Express application we defined in app.js
const app = require('./app');

// Import the database connection pool
const { pool, testConnection } = require('./config/database');

// ============================================
// Start the HTTP Server
// ============================================
// app.listen() does two things:
// 1. Creates a native Node.js HTTP server
// 2. Binds it to the specified port and starts accepting connections
//
// The callback function runs ONCE when the server is ready.
// We log a message so you know it's actually running.
const server = app.listen(config.port, async () => {
  console.log('='.repeat(50));
  console.log(`  Flash Sale Manager`);
  console.log(`  Environment : ${config.nodeEnv}`);
  console.log(`  Port        : ${config.port}`);
  console.log(`  URL         : http://localhost:${config.port}`);
  console.log('='.repeat(50));
  
  // Test our MySQL database connection
  await testConnection();
});

// ============================================
// Graceful Shutdown Handling
// ============================================
// WHY: When you press Ctrl+C or deploy a new version,
// the server receives a SIGTERM/SIGINT signal.
//
// Without graceful shutdown:
//   - In-flight requests get DROPPED mid-response
//   - Database connections aren't properly closed
//   - Users see "connection reset" errors
//
// With graceful shutdown:
//   - Stop accepting NEW connections
//   - Wait for existing requests to finish
//   - Close database/Redis connections cleanly
//   - THEN exit the process
//
// During a flash sale with thousands of active orders,
// a hard crash could corrupt order data. Graceful
// shutdown prevents that.

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // server.close() stops accepting new connections
  // but lets in-flight requests complete.
  server.close(async () => {
    console.log('All HTTP connections closed.');
    
    try {
      // Close all database connections cleanly
      await pool.end();
      console.log('Database connection pool closed.');
    } catch (err) {
      console.error('Error closing database connection pool:', err.message);
    }
    
    console.log('Server shut down cleanly.');
    // Exit code 0 = clean exit (tells Docker/PM2 to not restart)
    process.exit(0);
  });

  // Safety net: if connections don't close in 10 seconds, force exit.
  // This prevents the server from hanging forever.
  setTimeout(() => {
    console.error('Could not close connections in time. Forcing exit.');
    process.exit(1); // Exit code 1 = error (tells Docker/PM2 something went wrong)
  }, 10000);
};

// Register shutdown handlers for different termination signals:
// SIGTERM = sent by Docker/Kubernetes when stopping a container
// SIGINT  = sent when you press Ctrl+C in the terminal
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
