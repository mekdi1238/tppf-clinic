/**
 * Loads and validates environment variables once, at startup, in one
 * place. The rest of the codebase imports `config` from here instead of
 * reading `process.env` directly all over the place — that way, a missing
 * or malformed setting fails loudly and immediately when the server
 * starts, rather than causing a confusing error somewhere deep in a
 * request handler hours later.
 */

require("dotenv").config();

const required = ["DATABASE_URL", "JWT_SECRET"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(", ")}. ` +
      `Copy .env.example to .env and fill in real values.`
  );
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
};

module.exports = config;
