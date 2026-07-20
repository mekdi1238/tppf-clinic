const logger = require("../utils/logger");

class ApiError extends Error {
  constructor(statusCode, messageKey, message) {
    super(message);
    this.statusCode = statusCode;
    this.messageKey = messageKey;
  }
}

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    logger.warn(`Handled error: ${err.messageKey}`, { path: req.path, statusCode: err.statusCode });
    return res.status(err.statusCode).json({
      error: {
        messageKey: err.messageKey,
        message: err.message,
        statusCode: err.statusCode,
      },
    });
  }

  logger.error("Unexpected error", { path: req.path, message: err.message, stack: err.stack });
  return res.status(500).json({
    error: {
      messageKey: "internal_server_error",
      message: "Something went wrong. Please try again.",
      statusCode: 500,
    },
  });
}

module.exports = { ApiError, errorHandler };
