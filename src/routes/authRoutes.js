const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Public routes (no token needed, but rate-limited)
// WHY rate limit these specifically:
// - Login is the #1 brute-force target.
// - Register is targeted by spam bots creating fake accounts.
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

// Protected route (token required)
router.get('/me', authenticate, getMe);

module.exports = router;
