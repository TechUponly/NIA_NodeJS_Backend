const { errorResponse } = require('../utils/responseHelper');

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error stack:', err.stack);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // MySQL/Database errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409;
        message = 'Duplicate entry found';
        break;
      case 'ER_NO_SUCH_TABLE':
        statusCode = 500;
        message = 'Database table not found';
        break;
      case 'ER_BAD_FIELD_ERROR':
        statusCode = 400;
        message = 'Invalid database field';
        break;
      case 'ECONNREFUSED':
        statusCode = 503;
        message = 'Database connection refused';
        break;
      case 'ER_ACCESS_DENIED_ERROR':
        statusCode = 503;
        message = 'Database access denied';
        break;
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  return errorResponse(res, statusCode, message, process.env.NODE_ENV === 'development' ? err.stack : null);
};

// 404 handler middleware
const notFound = (req, res, next) => {
  return errorResponse(res, 404, `Route ${req.originalUrl} not found`);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler
};
