const express = require('express');
const { createProduct, getProducts, getProductById } = require('../controllers/productController');

// An Express router allows us to group related routes together
const router = express.Router();

// Route: POST /api/products
// Maps the HTTP POST request to our createProduct controller function
router.post('/', createProduct);

// Route: GET /api/products
router.get('/', getProducts);

// Route: GET /api/products/:id
router.get('/:id', getProductById);

module.exports = router;
