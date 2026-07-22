/**
 * The single, shared database connection pool for the running application.
 *
 * Why a pool and not a single connection: every incoming HTTP request that
 * needs the database borrows a connection from this pool, uses it, and
 * gives it back — the pool handles opening/reusing/closing real
 * connections underneath. Without it, either every request would pay the
 * cost of opening a brand new database connection (slow), or the whole
 * app would be stuck sharing one single connection across every
 * simultaneous request (a bottleneck, and unsafe for concurrent queries).
 *
 * This is intentionally separate from db/migrate.js's connection — the
 * migration runner is a one-off CLI script, not part of the long-running
 * server, so it manages its own short-lived connection instead of
 * depending on this pool existing.
 */

const { Pool } = require("pg");
const config = require("../config/env");

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Fires if a connection that's just sitting idle in the pool errors out
// (e.g. the database restarted). Without this handler, that error would
// crash the whole Node process — logging it here instead keeps the app
// running and the problem visible.
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

/**
 * A tiny wrapper around pool.query, kept here so every part of the app
 * queries the database through the same function. Later, this is the one
 * place we'd add things like slow-query logging without having to change
 * every file that runs a query.
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
