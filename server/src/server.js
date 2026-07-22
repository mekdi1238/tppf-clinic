const createApp = require("./app");
const config = require("./config/env");
const { pool } = require("./db/pool");
const logger = require("./utils/logger");

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port} (${config.env})`);
});

/**
 * Graceful shutdown: when the process receives a termination signal
 * (e.g. Ctrl+C locally, or a deploy platform stopping the process),
 * finish handling any in-flight requests and cleanly close the database
 * pool before exiting, rather than dropping connections mid-request.
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    logger.info("Server and database pool closed. Goodbye.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
