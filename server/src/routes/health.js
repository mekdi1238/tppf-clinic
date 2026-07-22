const express = require("express");
const { query } = require("../db/pool");

const router = express.Router();

/**
 * GET /api/health
 *
 * This is the Day 2 Definition of Done requirement: "Core module with a
 * health-check endpoint." It does one real thing beyond "the server is
 * running" — it also runs a trivial query against the database, so a
 * request to this endpoint actually confirms the whole chain (server ->
 * connection pool -> Postgres) is working, not just that the Node process
 * is alive.
 */
router.get("/health", async (req, res, next) => {
  try {
    const result = await query("SELECT now() AS db_time;");
    res.json({
      status: "ok",
      server_time: new Date().toISOString(),
      database: {
        connected: true,
        db_time: result.rows[0].db_time,
      },
    });
  } catch (err) {
    // Deliberately not using next(err) here — a failed health check
    // should report itself clearly as a health check failure (503,
    // "service unavailable"), not get funneled through the generic error
    // handler and come back looking like an unrelated 500.
    res.status(503).json({
      status: "error",
      server_time: new Date().toISOString(),
      database: {
        connected: false,
      },
      message: "Database connection failed.",
    });
  }
});

module.exports = router;
