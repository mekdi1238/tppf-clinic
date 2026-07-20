const express = require("express");
const path = require("path");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const patientsRoutes = require("./routes/patients");
const visitsRoutes = require("./routes/visits");
const registrationsRoutes = require("./routes/registrations");
const certificationsRoutes = require("./routes/certifications");
const notFound = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.use(express.json());

  app.use("/api", healthRoutes);
  app.use("/api/v1", authRoutes);
  app.use("/api/v1", dashboardRoutes);
  app.use("/api/v1", patientsRoutes);
  app.use("/api/v1", visitsRoutes);
  app.use("/api/v1", registrationsRoutes);
  app.use("/api/v1", certificationsRoutes);

  app.use(express.static(path.join(__dirname, "..", "..", "client")));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
