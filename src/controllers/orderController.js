const Order = require('../models/Order');
const OrderService = require('../services/orderService');
const AsyncOrderService = require('../services/asyncOrderService');
const { BadRequestError } = require('../utils/errors');

// ============================================
// Order Controller (THIN — HTTP concerns only)
// ============================================
// WHY: The controller's ONLY job is:
//   1. Extract data from the HTTP request (req.body, req.params, req.headers)
//   2. Call the service layer
//   3. Format and send the HTTP response
// There is NO business logic, NO SQL, and NO transaction management here.

/**
 * @desc    Place a new order
 * @route   POST /api/orders
 * @access  Public
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { productId, customerName, customerEmail, quantity } = req.body;

    // --- Input format validation (HTTP concern) ---
    if (!productId || !customerName || !customerEmail || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Please provide productId, customerName, customerEmail, and quantity'
      });
    }

    const numericProductId = parseInt(productId, 10);
    const numericQuantity = parseInt(quantity, 10);

    if (isNaN(numericProductId) || numericProductId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'productId must be a valid positive integer'
      });
    }

    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'quantity must be a valid integer greater than 0'
      });
    }

    // --- Extract idempotency key from header (HTTP concern) ---
    const idempotencyKey = req.headers['idempotency-key'] || null;

    // --- Delegate to the service layer (all business logic lives there) ---
    const result = await OrderService.placeOrder(
      {
        productId: numericProductId,
        customerName: customerName || req.user.name,
        customerEmail: customerEmail || req.user.email,
        quantity: numericQuantity,
        userId: req.user.id
      },
      idempotencyKey
    );

    // --- Format HTTP response ---
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: result
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get orders (Admin sees all, Customer sees own)
 * @route   GET /api/orders
 * @access  Private
 */
exports.getOrders = async (req, res, next) => {
  try {
    let orders;
    if (req.user.role === 'admin') {
      // Admin can see all orders
      orders = await Order.findAll();
    } else {
      // Customers only see their own orders
      orders = await Order.findByUserId(req.user.id);
    }
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single order by ID (with ownership check)
 * @route   GET /api/orders/:id
 * @access  Private (owner or admin)
 */
exports.getOrderById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: `Order with ID ${id} not found`
      });
    }

    // OBJECT-LEVEL AUTHORIZATION:
    // A customer can only view their OWN orders.
    // An admin can view ANY order.
    // Without this check, any authenticated user could view
    // any other user's order by guessing the ID.
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own orders.'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update order status (State Machine)
 * @route   PATCH /api/orders/:id/status
 * @access  Public
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a status to transition to'
      });
    }

    // Delegate to the service's state machine
    const updatedOrder = await OrderService.updateOrderStatus(id, status);

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: updatedOrder
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Place a new order ASYNCHRONOUSLY via Redis queue
 * @route   POST /api/orders/async
 * @access  Public
 */
exports.createAsyncOrder = async (req, res, next) => {
  try {
    const { productId, customerName, customerEmail, quantity } = req.body;

    if (!productId || !customerName || !customerEmail || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Please provide productId, customerName, customerEmail, and quantity'
      });
    }

    const numericProductId = parseInt(productId, 10);
    const numericQuantity = parseInt(quantity, 10);

    if (isNaN(numericProductId) || numericProductId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'productId must be a valid positive integer'
      });
    }

    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'quantity must be a valid integer greater than 0'
      });
    }

    const idempotencyKey = req.headers['idempotency-key'] || null;

    const { order, isExisting } = await AsyncOrderService.acceptOrder(
      {
        productId: numericProductId,
        customerName: customerName || req.user.name,
        customerEmail: customerEmail || req.user.email,
        quantity: numericQuantity,
        userId: req.user.id
      },
      idempotencyKey
    );

    // 202 Accepted: "We received your order. It will be processed shortly."
    // NOT 201 Created — because the order is not fully confirmed yet.
    const statusCode = isExisting ? 200 : 202;

    res.status(statusCode).json({
      success: true,
      message: isExisting
        ? 'Order already exists (idempotent return)'
        : 'Order accepted for processing',
      data: order
    });

  } catch (error) {
    next(error);
  }
};
