const express = require("express");
const { query } = require("../db/pool");

const router = express.Router();

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
