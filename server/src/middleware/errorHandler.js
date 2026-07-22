const logger = require("../utils/logger");

/**
 * A small, deliberate error class the rest of the app should throw
 * instead of a plain Error when it wants to control the HTTP status code
 * and give the frontend a translatable message key. Example:
 *
 *   throw new ApiError(404, "patient_not_found", "Patient not found");
 *
 * Why a messageKey separate from message: this system is bilingual
 * (English/Amharic). The frontend needs a stable key ("patient_not_found")
 * it can look up in its own translation table, not just an English
 * sentence it would have to guess how to translate.
 */
class ApiError extends Error {
  constructor(statusCode, messageKey, message) {
    super(message);
    this.statusCode = statusCode;
    this.messageKey = messageKey;
  }
}

/**
 * Express's catch-all error handler. This has to be registered LAST,
 * after every route and other middleware, because Express recognizes an
 * error handler specifically by it having four arguments (err, req, res,
 * next) — that's not a style choice, Express relies on the argument count.
 *
 * Every error response from this API has the same shape, per the team's
 * development rules ("every API error returns a consistent shape"):
 *
 *   { "error": { "messageKey": "...", "message": "...", "statusCode": 400 } }
 *
 * Any route handler can either throw an ApiError directly, or throw/pass
 * a regular Error/unexpected exception — this handler treats anything
 * that isn't an ApiError as an unexpected 500, and deliberately does NOT
 * leak internal error details (e.g. a raw database error message) back to
 * the client, only to the server log.
 */
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

  // Anything else is unexpected — log the full detail server-side, but
  // send the client a generic message rather than internal specifics
  // (e.g. never send a raw Postgres error string to the browser).
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
