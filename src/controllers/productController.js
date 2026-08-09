const Product = require('../models/Product');

// ============================================
// Product Controller
// ============================================
// WHY: Controllers handle the HTTP logic. They extract data from the 
// request (req), pass it to the Model to do the database work, and 
// then format the HTTP response (res).
// Notice how THIN this is. There is no SQL here.

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Public (for now)
 */
exports.createProduct = async (req, res, next) => {
  try {
    const { name, price, stock } = req.body;

    // 1. Basic Validation
    // A 400 Bad Request indicates the client sent invalid data.
    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both a name and a price for the product'
      });
    }

    const numericPrice = parseFloat(price);
    const numericStock = parseInt(stock, 10) || 0;

    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Price must be a number greater than 0'
      });
    }

    if (isNaN(numericStock) || numericStock < 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock must be a non-negative integer'
      });
    }

    // 2. Call the Model to save to the database
    const productId = await Product.create({
      ...req.body,
      price: numericPrice,
      stock: numericStock
    });

    // 3. Send a 201 Created response
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        id: productId,
        name,
        price: numericPrice,
        stock: numericStock,
        flash_sale: req.body.flash_sale || false,
        sale_start: req.body.sale_start || null,
        sale_end: req.body.sale_end || null
      }
    });

  } catch (error) {
    // Pass errors to our global error handler in app.js
    next(error);
  }
};

/**
 * @desc    Get all products
 * @route   GET /api/products
 * @access  Public
 */
exports.getProducts = async (req, res, next) => {
  try {
    const products = await Product.findAll();
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get product details by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
exports.getProductById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID'
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${id} not found`
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};
