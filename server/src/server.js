const createApp = require("./app");
const config = require("./config/env");
const { pool } = require("./db/pool");
const logger = require("./utils/logger");
const backupScheduler = require("./services/backupScheduler");

/**
 * Resilient database connection wait loop.
 * Ensures that during Windows system startup (when services boot concurrently),
 * the server waits for PostgreSQL to become fully ready instead of crashing.
 */
async function waitForDatabase(maxRetries = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query("SELECT 1;");
      logger.info("Database connection established successfully.");
      return;
    } catch (err) {
      logger.warn(
        `[DATABASE INIT] PostgreSQL not ready yet (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${delayMs / 1000}s...`
      );
      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to PostgreSQL after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function startServer() {
  try {
    // 1. Wait for database to be ready
    await waitForDatabase();

    // 2. Initialize Express application
    const app = createApp();

    const server = app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} (${config.env})`);
      // Start background backup scheduler
      try {
        backupScheduler.startScheduler();
      } catch (err) {
        logger.error("Failed to initialize backup scheduler:", err);
      }
    });

    /**
     * Graceful shutdown: when the process receives a termination signal
     * (e.g. WinSW stopping service or Ctrl+C locally), cleanly close connections.
     */
    async function shutdown(signal) {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        backupScheduler.stopScheduler();
      } catch (e) {
        // ignore
      }
      server.close(async () => {
        try {
          await pool.end();
          logger.info("Server and database pool closed. Goodbye.");
        } catch (poolErr) {
          logger.error("Error closing database pool:", poolErr);
        }
        process.exit(0);
      });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (fatalErr) {
    logger.error("Fatal startup error:", fatalErr);
    process.exit(1);
  }
}

startServer();

