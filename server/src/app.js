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
const admissionsRoutes = require("./routes/admissions");
const labOrdersRoutes = require("./routes/labOrders");
const pharmacyRoutes = require("./routes/pharmacy");
const referralsRoutes = require("./routes/referralsAndSickLeaves");
const usersRoutes = require("./routes/users");
const settingsRoutes = require("./routes/settings");
const backupsRoutes = require("./routes/backups");
const checkupsRoutes = require("./routes/checkups");
const staffRoutes = require("./routes/staff");
const auditLogsRoutes = require("./routes/auditLogs");
const departmentsRoutes = require("./routes/departments");
const auditMiddleware = require("./middleware/auditMiddleware");
const notFound = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

/**
 * Builds and returns the Express app, but does NOT start it listening —
 * that happens in server.js.
 */
function createApp() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  app.use(auditMiddleware);

  app.use("/api", healthRoutes);
  app.use("/api/v1", authRoutes);
  app.use("/api/v1", dashboardRoutes);
  app.use("/api/v1", patientsRoutes);
  app.use("/api/v1", visitsRoutes);
  app.use("/api/v1", registrationsRoutes);
  app.use("/api/v1", certificationsRoutes);
  app.use("/api/v1", vitalsRoutes);
  app.use("/api/v1", admissionsRoutes);
  app.use("/api/v1", labOrdersRoutes);
  app.use("/api/v1", pharmacyRoutes);
  app.use("/api/v1", referralsRoutes);
  app.use("/api/v1", usersRoutes);
  app.use("/api/v1", staffRoutes);
  app.use("/api/v1", settingsRoutes);
  app.use("/api/v1", backupsRoutes);
  app.use("/api/v1", checkupsRoutes);
  app.use("/api/v1", auditLogsRoutes);
  app.use("/api/v1", departmentsRoutes);

  // Prevent browser from caching HTML pages (kills bfcache for protected pages).
  // This forces the browser to re-fetch pages on Back/Forward navigation,
  // ensuring auth.js's requireAuth() always runs fresh.
  app.use((req, res, next) => {
    if (req.path.endsWith(".html") || req.path === "/") {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
    next();
  });

  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
