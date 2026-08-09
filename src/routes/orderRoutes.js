const express = require('express');
const { createOrder, getOrders, getOrderById, updateOrderStatus } = require('../controllers/orderController');

const router = express.Router();

// Maps routes to their controller handlers
router.post('/', createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);

module.exports = router;
