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

module.exports = { pool, query };
