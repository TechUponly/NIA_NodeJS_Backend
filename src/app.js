const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const os = require("os");
require("dotenv").config();

const { testConnection } = require("./config/database");
const routes = require("./routes");
const { requestLogger } = require("./middleware/logger");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces

// Security middleware
app.use(helmet());

// CORS configuration - Allow all origins for network access
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
app.use(requestLogger);

// Add request ID for tracing
app.use((req, res, next) => {
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  next();
});

// Health check endpoint (before API routes)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "HRMS API Server is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: [
      "Authentication API (PHP Compatible)",
      "Admin Access Management",
      "HR Policies API",
      "Health Monitoring",
    ],
    endpoints: {
      health: "/api/v1/health",
      auth: "/api/v1/auth/*",
      admin: "/api/v1/admin/*",
      hr: "/api/v1/hr/*",
    },
  });
});

// API routes
app.use("/", routes);

// Error handling middleware (must be after routes)
app.use(notFound);
app.use(errorHandler);

// Get network interfaces for display
const getNetworkInterfaces = () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address,
        });
      }
    }
  }

  return addresses;
};

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error(
        "❌ Failed to connect to database. Please check your configuration."
      );
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
