const { ApiError } = require("./errorHandler");

function notFound(req, res, next) {
  next(new ApiError(404, "route_not_found", `No route matches ${req.method} ${req.path}`));
}

module.exports = notFound;
