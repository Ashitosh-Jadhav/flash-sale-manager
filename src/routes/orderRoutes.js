const express = require('express');
const { createOrder, createAsyncOrder, getOrders, getOrderById, updateOrderStatus } = require('../controllers/orderController');

const router = express.Router();

// Synchronous order endpoint (Version 1 — for baseline comparison)
router.post('/', createOrder);

// Asynchronous order endpoint (Version 2 — Redis queue)
router.post('/async', createAsyncOrder);

// Read endpoints
router.get('/', getOrders);
router.get('/:id', getOrderById);

// State machine
router.patch('/:id/status', updateOrderStatus);

module.exports = router;
