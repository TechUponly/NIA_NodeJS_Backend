const express = require("express");
const router = express.Router();

// Import controllers
const authController = require("../controllers/authController");
const hrPolicyController = require("../controllers/hrPolicyController");
const adminAccessController = require("../controllers/adminAccessController");

// ========================================
// HEALTH CHECK ROUTES
// ========================================
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "HRMS API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    endpoints: {
      auth: "/auth",
      hr: "/hr",
      admin: "/admin",
      health: "/health",
    },
  });
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================
router.get("/auth/login", authController.login);
router.get("/auth/profile/:empId", authController.getProfile);
router.post("/auth/logout", authController.logout);
router.get("/auth/validate-session", authController.validateSession);

// ========================================
// ADMIN ACCESS ROUTES
// ========================================
router.get(
  "/admin/admin-access-pages",
  adminAccessController.getAdminAccessPages
);

// ========================================
// HR POLICY ROUTES
// ========================================
router.post("/hr/hr-policies-concern", hrPolicyController.getPolicyConcerns);

// ========================================
// ERROR HANDLING ROUTES
// ========================================

// 404 handler for API routes
router.use("*", (req, res) => {
  res.status(404).json({
    status: "error",
    message: "API endpoint not found",
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      health: ["GET /health"],
      auth: [
        "GET /auth/login",
        "GET /auth/profile/:empId",
        "POST /auth/logout",
        "GET /auth/validate-session",
      ],
      admin: ["GET /admin/admin-access-pages"],
      hr: ["POST /hr/hr-policies-concern"],
    },
  });
});

module.exports = router;
