/**
 * Standardized error response builder.
 * Strips internal details in production, includes them in development.
 */

const isDev = process.env.NODE_ENV !== 'production';

// Known safe error messages that can be shown to clients
const SAFE_ERRORS = new Set([
  'Not found',
  'Unauthorized',
  'Forbidden',
  'Invalid credentials',
  'Token expired',
  'Rate limited',
]);

/**
 * Build a safe error response object.
 * In production, strips stack traces and internal messages.
 */
function safeError(err, defaultMessage = 'Internal server error') {
  const message = err?.message || defaultMessage;

  // Check if this is a known safe message
  const isSafe = SAFE_ERRORS.has(message) ||
    message.length < 100 && !message.includes('SQL') &&
    !message.includes('SQLITE') && !message.includes('column') &&
    !message.includes('table') && !message.includes('constraint') &&
    !message.includes('ECONNREFUSED') && !message.includes('at ') &&
    !message.includes('node_modules');

  if (isDev) {
    return {
      error: message,
      ...(err?.stack ? { stack: err.stack } : {})
    };
  }

  return {
    error: isSafe ? message : defaultMessage
  };
}

/**
 * Log error with context, stripping sensitive data.
 */
function logError(context, err, request) {
  const logData = {
    context,
    message: err?.message,
    requestId: request?.id,
    method: request?.method,
    url: request?.url,
    userId: request?.user?.id,
  };

  if (isDev) {
    logData.stack = err?.stack;
  }

  console.error(`[ERROR] ${context}:`, JSON.stringify(logData));
}

/**
 * Standard error reply helper for route handlers.
 */
function errorReply(reply, statusCode, err, defaultMessage) {
  reply.code(statusCode);
  return safeError(err, defaultMessage);
}

module.exports = { safeError, logError, errorReply };
