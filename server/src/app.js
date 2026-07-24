const express = require("express");
const path = require("path");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const patientsRoutes = require("./routes/patients");
const visitsRoutes = require("./routes/visits");
const registrationsRoutes = require("./routes/registrations");
const certificationsRoutes = require("./routes/certifications");
const vitalsRoutes = require("./routes/vitals");
const notFound = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

/**
 * Builds and returns the Express app, but does NOT start it listening —
 * that happens in server.js. Splitting these two apart means the app can
 * be imported and tested (e.g. with a request-testing library) without
 * needing to actually bind a network port, which matters once automated
 * tests are added in later modules.
 */
function createApp() {
  const app = express();

  // Parses incoming JSON request bodies into req.body. Every module from
  // Day 3 onward (login, registration forms, etc.) depends on this.
  app.use(express.json());

  // All routes live under /api — this leaves room to serve the frontend's
  // static files from the same server later without any path collisions,
  // and makes it immediately obvious from a URL alone which requests are
  // hitting the backend.
  app.use("/api", healthRoutes);
  app.use("/api/v1", authRoutes);
  app.use("/api/v1", dashboardRoutes);
  app.use("/api/v1", patientsRoutes);
  app.use("/api/v1", visitsRoutes);
  app.use("/api/v1", registrationsRoutes);
  app.use("/api/v1", certificationsRoutes);
  app.use("/api/v1", vitalsRoutes);

  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  // These two MUST be registered last, in this order: notFound catches
  // anything no earlier route matched, and errorHandler catches anything
  // thrown or passed to next() anywhere above it.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
