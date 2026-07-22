const { ApiError } = require("./errorHandler");

/**
 * Registered after every real route but before the error handler. If a
 * request reaches this point, no route matched it — turn that into the
 * same consistent error shape everything else uses, rather than letting
 * Express fall back to its own default HTML "Cannot GET /whatever" page.
 */
function notFound(req, res, next) {
  next(new ApiError(404, "route_not_found", `No route matches ${req.method} ${req.path}`));
}

module.exports = notFound;
