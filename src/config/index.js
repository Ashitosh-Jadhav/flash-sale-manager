// ============================================
// Centralized Configuration
// ============================================
// WHY this file exists:
// Instead of scattering process.env.XYZ across
// your codebase, we read ALL env vars here,
// validate them, apply defaults, and export
// a single config object.
//
// If config source changes later (e.g., from
// .env to AWS Secrets Manager), we only change
// THIS file. Every other file just imports config.
// ============================================

const path = require('path');
const dotenv = require('dotenv');

// Load .env file into process.env relative to project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  // The port our HTTP server will listen on.
  // process.env.PORT reads from .env file.
  // || 3000 is a fallback default if .env is missing.
  port: process.env.PORT || 3000,

  // 'development' enables verbose error messages.
  // 'production' hides internal errors from users.
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database configuration mapped from environment variables
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'flash_sale_db',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  }
};

module.exports = config;
