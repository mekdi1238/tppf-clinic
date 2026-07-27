/**
 * The single, shared database connection pool for the running application.
 */

const { Pool } = require("pg");
const config = require("../config/env");

const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Executes a callback within a database transaction context (BEGIN / COMMIT / ROLLBACK).
 * Pass the checked-out `client` to queries inside the callback.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
