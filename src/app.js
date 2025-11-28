const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const os = require("os");
require("dotenv").config();
const path = require('path');

const { testConnection } = require("./config/database");
const routes = require("./routes");
const { requestLogger } = require("./middleware/logger");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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
      health: "/health",
      auth: "/auth/*",
      admin: "/admin/*",
      hr: "/hr/*",
    },
  });
});

app.use('/Announcement', express.static(path.join(__dirname, '../Announcement')));

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

    app.listen(PORT, HOST, () => {
      const networkInterfaces = getNetworkInterfaces();

      console.log("🚀 HRMS API Server Details:");
      console.log(`   📍 Local: http://localhost:${PORT}`);
      console.log(`   📍 Health: http://localhost:${PORT}/health`);
      console.log(`   🔐 Auth API: http://localhost:${PORT}/auth`);
      console.log(`   👨‍💼 Admin API: http://localhost:${PORT}/admin`);
      console.log(`   📋 HR API: http://localhost:${PORT}/hr`);

      console.log("🔗 Key Endpoints:");
      console.log(`   • Login: GET http://localhost:${PORT}/auth/login`);
      console.log(
        `   • Profile: GET http://localhost:${PORT}/auth/profile/:empId`
      );
      console.log(
        `   • Logout: POST http://localhost:${PORT}/auth/logout`
      );
      console.log(
        `   • Admin Access: GET http://localhost:${PORT}/admin/admin-access-pages`
      );
      console.log(
        `   • HR Policies: POST http://localhost:${PORT}/hr/hr-policies-concern`
      );

      if (networkInterfaces.length > 0) {
        console.log("\n🌐 Network Access:");
        networkInterfaces.forEach((net) => {
          console.log(`   📡 ${net.interface}: http://${net.address}:${PORT}`);
          console.log(
            `   🔐 Auth API: http://${net.address}:${PORT}/auth`
          );
          console.log(
            `   👨‍💼 Admin API: http://${net.address}:${PORT}/admin`
          );
          console.log(`   📋 HR API: http://${net.address}:${PORT}/hr`);
        });

        console.log("\n📱 For Mobile/External Access:");
        console.log(`   🔗 Use any of the above IP addresses`);
        console.log(`   🔒 Make sure firewall allows port ${PORT}`);
      }

      console.log(`\n🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`💾 Database: ${process.env.DB_NAME || "uat_hrms_nia"}`);
      console.log("📦 API Features:");
      console.log("   ✅ PHP-Compatible Authentication");
      console.log("   ✅ Admin Access Management");
      console.log("   ✅ HR Policy Management");
      console.log("   ✅ Network Access Support");
      console.log("   ✅ Request Logging & Error Handling");
      console.log("✅ Server is ready to accept connections");

      if (process.env.NODE_ENV === "development") {
        console.log("\n💡 Tips for Testing:");
        console.log(
          `   • Login: curl "http://localhost:${PORT}/auth/login?t1=C001&t2=pass&user_type=Employee"`
        );
        console.log(
          `   • Health: curl "http://localhost:${PORT}/health"`
        );
        console.log(
          `   • Admin Access: curl "http://localhost:${PORT}/admin/admin-access-pages?emp_id=C001"`
        );
        console.log(
          `   • HR Policy: curl -X POST "http://localhost:${PORT}/hr/hr-policies-concern" -H "Content-Type: application/json" -d '{"empId":"C001"}'`
        );
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
