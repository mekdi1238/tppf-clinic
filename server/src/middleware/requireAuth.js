const { verifyToken } = require("../auth/jwt");
const { ApiError } = require("./errorHandler");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "missing_token", "Authentication required."));
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(new ApiError(401, "invalid_token", "Your session has expired. Please sign in again."));
  }
}

module.exports = requireAuth;
