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
const employeeController = require("../controllers/employeeController");
const otpController = require("../controllers/otpController");
const pincodeController = require("../controllers/pincodeController");
const companyController = require("../controllers/companyController");
const locationController = require("../controllers/locationController");
const attendanceController = require("../controllers/attendanceController");
const mobileController = require("../controllers/mobileController");
const shiftController = require("../controllers/shiftController");
const letterController = require("../controllers/letterController");
const editEmployeeController = require("../controllers/editEmployeeController");
const orgController = require("../controllers/organizationController");
const peopleController = require("../controllers/peopleController");

// ========================================
// FILE UPLOAD CONFIG (Multer)
// ========================================

// NAVIGATE: src/routes/ -> src/ -> root -> admin/leave_docs
const uploadDir = path.join(__dirname, "../../admin/leave_docs");

// Create folder if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Saves to admin/leave_docs
  },
  filename: (req, file, cb) => {
    const empId = req.body.emp_id || "unknown";
    const ext = path.extname(file.originalname);
    cb(null, `${empId}_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage: storage });

const adminUploadDir = path.join(__dirname, "../../admin/Upload");

if (!fs.existsSync(adminUploadDir)) {
  fs.mkdirSync(adminUploadDir, { recursive: true });
}

const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, adminUploadDir);
  },
  filename: (req, file, cb) => {
    const mno = req.body.mno || "unknown";

    // PHP date("YmdHis") equivalent
    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0") +
      now.getSeconds().toString().padStart(2, "0");

    // Filename: Timestamp_Mobile_OriginalName
    cb(null, `${timestamp}_${mno}_${file.originalname}`);
  },
});

const uploadAdmin = multer({ storage: adminStorage });

// =======================================================
// SINGLE DOCUMENT UPLOAD CONFIG (Specific Naming)
// =======================================================
const singleDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, adminUploadDir);
  },
  filename: (req, file, cb) => {
    // FIX: Check both Body (POST) and Query (GET)
    const empId = req.body.emp_id || req.query.emp_id || "unknown";
    const type = req.body.type || req.query.type || "doc";

    const rndno = Math.floor(1000 + Math.random() * 9000);
    const ext = path.extname(file.originalname).toLowerCase();

    // Format: 5_af_1234.jpg
    cb(null, `${empId}_${type}_${rndno}${ext}`);
  },
});

const uploadSingle = multer({
  storage: singleDocStorage,
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|jfif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Sorry, only JPG, JPEG, PNG, PDF & GIF files are allowed"));
  },
});

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

// ============= BYPASS LOGIN ROUTES (NEW) =============

router.post("/auth/bypass-login", authController.bypassLogin);
router.post("/auth/validate-user", authController.validateUser);

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
router.post(
  "/leave/get-leave-full-history",
  leaveController.getFullLeaveHistory
);
router.post(
  "/leave/apply-leave",
  upload.single("document"),
  leaveController.applyLeave
);
router.get("/leave/get-manager-leaves", leaveController.getManagerLeaves);
router.post("/leave/update-leave-status", leaveController.processLeaveUpdate);
router.get("/leave/update-leave-status", leaveController.processLeaveUpdate);
router.get("/leave/leave-report", leaveController.generateLeaveReport);
router.get(
  "/admin/get-employee-details",
  employeeController.getEmployeeDetails
);
router.get("/admin/get-employee-count", employeeController.getEmployeeStats);
router.get("/mobile-otp", otpController.sendMobileOtp);
router.post("/mobile-otp", otpController.sendMobileOtp);
router.post(
  "/admin/employee-registration",
  employeeController.registerEmployee
);
router.post("/admin/get-add-employee", employeeController.getAddEmployeeData);
router.get("/admin/get-add-employee", employeeController.getAddEmployeeData);
router.get("/get-pincode", pincodeController.getPincodeData);
router.post("/get-pincode", pincodeController.getPincodeData);
router.get("/company-name-dropdown", companyController.getCompanyDropdown);
router.get("/get-office-location", locationController.getLocations);
router.post("/get-office-location", locationController.getLocations);
router.get("/get-hr-name", employeeController.getHrNames);
router.get(
  "/get-reporting-managers",
  employeeController.getReportingManagersList
);
router.post(
  "/get-reporting-managers",
  employeeController.getReportingManagersList
);
router.get("/get-department-by-orgname", companyController.getDepartments);
router.post("/get-department-by-orgname", companyController.getDepartments);
router.get("/get-designation-by-function", companyController.getDesignations);
router.post("/get-designation-by-function", companyController.getDesignations);
router.get("/get-band-by-designation", companyController.getBands);
router.post("/get-band-by-designation", companyController.getBands);
router.post(
  "/admin/add-employee-documents",
  uploadAdmin.any(),
  employeeController.uploadEmployeeDocuments
);
router.get("/get-attendance", attendanceController.getAttendance);
router.post(
  "/admin/get-detail-edit-employee",
  employeeController.getEditEmployeeDetails
);
router.get("/get-mobile-app-level", mobileController.getAppLevels);
router.get("/get-emp-shifttime", shiftController.getShiftTimings);
router.post(
  "/admin/absconding-send-check",
  letterController.checkAbscondingStatus
);
router.post(
  "/admin/update-emp-document",
  uploadSingle.single("image"),
  employeeController.updateDocument
);
router.post("/admin/edit-employee", editEmployeeController.editEmployee);
router.get("/admin/manage-organization", orgController.handleOrgRequest);
router.post("/admin/manage-organization", orgController.handleOrgRequest);
router.get("/get-people", peopleController.getPeopleHierarchy);
router.post(
  "/admin/upload-bulk-employee",
  employeeController.uploadBulkEmployees
);
router.post(
  "/get-employees-by-department",
  employeeController.getEmployeesByDepartment
);
router.post("/change-password", employeeController.changePassword);

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
