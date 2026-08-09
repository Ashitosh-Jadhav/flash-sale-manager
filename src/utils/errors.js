// ============================================
// Custom Error Classes
// ============================================
// WHY: Using custom error classes allows us to attach specific HTTP status
// codes to domain errors. The global error handler in app.js can then
// dynamically read err.statusCode and respond appropriately, keeping our
// controllers and services clean from hardcoded response mapping.

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource Conflict') {
    super(message, 409);
  }
}

class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient stock for this product') {
    super(message, 400);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  InsufficientStockError
};
