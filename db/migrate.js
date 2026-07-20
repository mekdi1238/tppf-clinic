#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function makeClient() {
  return new Client({ connectionString: process.env.DATABASE_URL });
}

function readMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function splitUpDown(fileContents) {
  const upMarker = "-- +migrate Up";
  const downMarker = "-- +migrate Down";
  const upIndex = fileContents.indexOf(upMarker);
  const downIndex = fileContents.indexOf(downMarker);
  if (upIndex === -1 || downIndex === -1) {
    throw new Error(
      `Migration file is missing "${upMarker}" or "${downMarker}" markers.`
    );
  }
  return {
    up: fileContents.slice(upIndex + upMarker.length, downIndex).trim(),
    down: fileContents.slice(downIndex + downMarker.length).trim(),
  };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedFilenames(client) {
  const result = await client.query(
    "SELECT filename FROM schema_migrations ORDER BY filename;"
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function cmdStatus(client) {
  const files = readMigrationFiles();
  const applied = await getAppliedFilenames(client);
  console.log("Migration status:\n");
  for (const file of files) {
    const marker = applied.has(file) ? "[applied]" : "[pending]";
    console.log(`  ${marker}  ${file}`);
  }
  const pendingCount = files.filter((f) => !applied.has(f)).length;
  console.log(`\n${pendingCount} pending, ${files.length - pendingCount} applied.`);
}

async function cmdUp(client) {
  const files = readMigrationFiles();
  const applied = await getAppliedFilenames(client);
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("Nothing to apply — database is already up to date.");
    return;
  }

  for (const file of pending) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const { up } = splitUpDown(fs.readFileSync(fullPath, "utf8"));

    console.log(`Applying ${file} ...`);
    try {
      await client.query("BEGIN");
      await client.query(up);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1);",
        [file]
      );
      await client.query("COMMIT");
      console.log(`  done.`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAILED — rolled back. ${err.message}`);
      throw err;
    }
  }
  console.log("\nAll pending migrations applied.");
}

async function cmdDown(client) {
  const applied = await getAppliedFilenames(client);
  if (applied.size === 0) {
    console.log("Nothing to revert — no migrations have been applied.");
    return;
  }
  const mostRecent = [...applied].sort().at(-1);
  const fullPath = path.join(MIGRATIONS_DIR, mostRecent);
  const { down } = splitUpDown(fs.readFileSync(fullPath, "utf8"));

  console.log(`Reverting ${mostRecent} ...`);
  try {
    await client.query("BEGIN");
    await client.query(down);
    await client.query("DELETE FROM schema_migrations WHERE filename = $1;", [
      mostRecent,
    ]);
    await client.query("COMMIT");
    console.log("  done.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  FAILED — rolled back. ${err.message}`);
    throw err;
  }
}

async function main() {
  const command = process.argv[2];
  if (!["up", "down", "status"].includes(command)) {
    console.error("Usage: node db/migrate.js <up|down|status>");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in."
    );
    process.exit(1);
  }

  const client = makeClient();
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    if (command === "status") await cmdStatus(client);
    if (command === "up") await cmdUp(client);
    if (command === "down") await cmdDown(client);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
