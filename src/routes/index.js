const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Import controllers
const authController = require("../controllers/authController");
const hrPolicyController = require("../controllers/hrPolicyController");
const adminAccessController = require("../controllers/adminAccessController");
const announcementController = require("../controllers/announcementController");
const holidayController = require("../controllers/holidayController");
const birthdayController = require("../controllers/birthdayController");
const leaveBalanceController = require("../controllers/leaveBalanceController");
const yearEndController = require("../controllers/yearEndController");
const leaveController = require("../controllers/leaveController");


// ========================================
// FILE UPLOAD CONFIG (Multer)
// ========================================

// NAVIGATE: src/routes/ -> src/ -> root -> admin/leave_docs
const uploadDir = path.join(__dirname, '../../admin/leave_docs');

// Create folder if it doesn't exist
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Saves to admin/leave_docs
  },
  filename: (req, file, cb) => {
    const empId = req.body.emp_id || 'unknown';
    const ext = path.extname(file.originalname);
    cb(null, `${empId}_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage: storage });

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
router.get("/get-announcement", announcementController.getAnnouncements);
router.get("/get-holidays", holidayController.getHolidays);
router.get("/get-birthdays", birthdayController.getBirthdays);
router.get("/get-birthday-wishes", birthdayController.getWishes);
router.post("/send-birthday-wish", birthdayController.submitWish);
router.get("/leave/get-leave-balance", leaveBalanceController.getLeaveBalance);
// Trigger Year End Processing (Run this once on Jan 1st)
router.post("/admin/run-year-end-process", yearEndController.runYearEndProcess);
router.post("/leave/get-leave-history", leaveController.getLeaveHistory);
router.post("/leave/apply-leave", upload.single('document'), leaveController.applyLeave);
router.get("/leave/get-manager-leaves", leaveController.getManagerLeaves);
router.post("/leave/update-leave-status", leaveController.processLeaveUpdate);
router.get("/leave/update-leave-status", leaveController.processLeaveUpdate);
router.get("/leave/leave-report", leaveController.generateLeaveReport);

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
