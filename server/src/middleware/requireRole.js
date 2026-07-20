const { ApiError } = require("./errorHandler");

function requireRole(...allowedRoles) {
  return function (req, res, next) {
    const userRoles = (req.user && req.user.roles) || [];
    const allowed = userRoles.some((role) => allowedRoles.includes(role));
    if (!allowed) {
      return next(new ApiError(403, "forbidden", "You do not have permission to perform this action."));
    }
    next();
  };
}

module.exports = requireRole;
