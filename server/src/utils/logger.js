/**
 * A deliberately simple logger for now: this is Day 2, and the goal is a
 * consistent way to log across the app, not a full logging platform.
 *
 * Important distinction (per the team's development rules): this is for
 * APPLICATION logs — technical information for debugging, like "server
 * started" or "database query failed". It is NOT the audit_log database
 * table, which records CLINICAL/business actions (who registered which
 * patient, who dispensed what) for accountability. Those two kinds of
 * logging serve different audiences and different purposes, and the audit
 * log write-path will be built as part of the Administration module
 * (Day 10), not here.
 */

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (message, meta = {}) => {
    console.log(`[${timestamp()}] INFO  ${message}`, Object.keys(meta).length ? meta : "");
  },
  warn: (message, meta = {}) => {
    console.warn(`[${timestamp()}] WARN  ${message}`, Object.keys(meta).length ? meta : "");
  },
  error: (message, meta = {}) => {
    console.error(`[${timestamp()}] ERROR ${message}`, Object.keys(meta).length ? meta : "");
  },
};

module.exports = logger;
