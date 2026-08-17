const express = require('express');
const { createProduct, getProducts, getProductById } = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ============================================
// Product Routes — Access Control Policy
// ============================================
// GET /api/products      → Public (anyone can browse products)
// GET /api/products/:id  → Public (anyone can view a product)
// POST /api/products     → Admin only (only admins create products)
// ============================================

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Admin-only routes
router.post('/', authenticate, authorize('admin'), createProduct);

module.exports = router;
