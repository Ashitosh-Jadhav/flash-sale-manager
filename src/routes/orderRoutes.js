const express = require('express');
const { createOrder, createAsyncOrder, getOrders, getOrderById, updateOrderStatus } = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ============================================
// Order Routes — Access Control + Rate Limiting
// ============================================
// POST endpoints are rate-limited per user (30/min).
// The order limiter runs AFTER authenticate so req.user is available.
// ============================================

// Authenticated routes (customer or admin) — rate limited
router.post('/', authenticate, orderLimiter, createOrder);
router.post('/async', authenticate, orderLimiter, createAsyncOrder);
router.get('/', authenticate, getOrders);
router.get('/:id', authenticate, getOrderById);

// Admin-only routes
router.patch('/:id/status', authenticate, authorize('admin'), updateOrderStatus);

module.exports = router;
