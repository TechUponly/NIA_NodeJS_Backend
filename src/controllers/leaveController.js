const leaveService = require("../services/leaveService");
const emailService = require("../services/emailService");
const { pool } = require("../config/database");
const { get } = require("../routes");

// Helper: JSON to CSV
const convertToCSV = (arr) => {
  if (!arr || !arr.length) return "";
  const headers = Object.keys(arr[0]).join(",");
  const rows = arr.map((obj) =>
    Object.values(obj)
      .map((val) => `"${String(val === null ? "" : val).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers, ...rows].join("\n");
};

// ==========================================
// 1. GET LEAVE HISTORY
// ==========================================
const getLeaveHistory = async (req, res) => {
  try {
    const { emp_id, date } = req.body;
    if (!emp_id || !date)
      return res
        .status(200)
        .json({ status: false, message: "Missing Parameters" });

    const rawData = await leaveService.getEmployeeLeavesByMonth(emp_id, date);

    if (rawData.length > 0) {
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;
      const formatToDayMonth = (dateStr) =>
        new Date(dateStr).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "2-digit",
        });

      const formattedData = rawData.map((row) => {
        const daysCount =
          row.no_of_days && row.no_of_days > 0 ? parseFloat(row.no_of_days) : 1;
        let periodDisplay = "";
        if (daysCount === 0.5) {
          const shiftLabel =
            row.shift_type === "2" ? "(2nd Half)" : "(1st Half)";
          periodDisplay = `${formatToDayMonth(row.fdate)} ${shiftLabel}`;
        } else if (
          new Date(row.fdate).getTime() === new Date(row.tdate).getTime()
        ) {
          periodDisplay = formatToDayMonth(row.fdate);
        } else {
          periodDisplay = `${formatToDayMonth(row.fdate)} to ${formatToDayMonth(
            row.tdate
          )}`;
        }

        const filename = row.document_path
          ? row.document_path.split(/[/\\]/).pop()
          : null;
        const docUrl = filename
          ? `${baseUrl}/admin/leave_docs/${filename}`
          : null;

        return {
          leave_id: row.leave_id,
          ltype: row.ltype,
          fdate: formatToDayMonth(row.apply_date),
          days: periodDisplay,
          dayscount: daysCount,
          comment: row.comment,
          emp_id: row.emp_id,
          l_status: row.l_status,
          admincomment: row.admincomment,
          approved_date: row.approved_date,
          document: docUrl,
        };
      });
      res
        .status(200)
        .json({ status: true, message: "Data Found", data: formattedData });
    } else {
      res
        .status(200)
        .json({ status: false, message: "No Data Available", data: [] });
    }
  } catch (error) {
    console.error("Error in getLeaveHistory:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

// ==========================================
// 2. APPLY FOR LEAVE
// ==========================================
const applyLeave = async (req, res) => {
  try {
    const input = req.body;
    if (!input.emp_id || !input.ltype || !input.fromdate || !input.todate)
      return res
        .status(200)
        .json({ success: false, message: "Missing required fields" });

    const emp = await leaveService.getEmployeeDetails(input.emp_id);
    if (!emp)
      return res
        .status(200)
        .json({ success: false, message: "Employee not found" });

    const actualEmpId = emp.emp_id;
    const employeeType = emp.employee_type || "Core";
    const ltype = input.ltype;
    const gender = emp.gender ? emp.gender.toUpperCase() : "MALE";

    // 1. RULES CHECK
    const rules = await leaveService.getLeaveConfiguration(employeeType);
    const rule = rules.find((r) => ltype.includes(r.leave_type));

    if (!rule && !ltype.includes("LWP") && !ltype.includes("Extraordinary")) {
      return res
        .status(200)
        .json({
          success: false,
          message: `Leave type '${ltype}' is not applicable for ${employeeType} employees.`,
        });
    }

    const isHalfDay = input.is_half_day === "1" || input.is_half_day === true;
    let fromDate = new Date(input.fromdate);
    let toDate = new Date(input.todate);
    const joinDate = new Date(emp.joindate);
    const isSaturdayWorking = emp.is_saturday_working
      ? emp.is_saturday_working.trim().toUpperCase()
      : "NO";

    // Probation Check
    const isProbation = employeeType === "Core Probation";
    const diffTime = Math.abs(fromDate - joinDate);
    const daysWorkedTotal = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Deductible Days Calculation
    let deductibleDays = 0;
    if (isHalfDay) {
      deductibleDays = 0.5;
      toDate = fromDate;
    } else {
      if (ltype.includes("Casual") && !ltype.includes("Special")) {
        // CL: Skip Sundays & Non-working Saturdays
        let current = new Date(fromDate);
        const end = new Date(toDate);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (
            dayOfWeek !== 0 &&
            !(dayOfWeek === 6 && isSaturdayWorking !== "YES")
          )
            deductibleDays++;
          current.setDate(current.getDate() + 1);
        }
      } else {
        const diff = Math.abs(toDate - fromDate);
        deductibleDays = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    // Validations (Limits)
    if (rule) {
      if (rule.max_per_request > 0 && deductibleDays > rule.max_per_request)
        return res
          .status(200)
          .json({
            success: false,
            message: `${ltype} cannot exceed ${rule.max_per_request} days at a time.`,
          });
      if (rule.min_per_request > 0 && deductibleDays < rule.min_per_request)
        return res
          .status(200)
          .json({
            success: false,
            message: `${ltype} must be a minimum of ${rule.min_per_request} days.`,
          });
    }

    // Strict probation blocks
    if (isProbation && (ltype.includes("Privilege") || ltype.includes("Sick")))
      return res
        .status(200)
        .json({
          success: false,
          message: "Probation Rule: Privilege/Sick Leave not allowed.",
        });

    // Gender blocks
    if (ltype.includes("Maternity") && gender !== "FEMALE")
      return res
        .status(200)
        .json({
          success: false,
          message: "Maternity Leave is only for Female employees.",
        });
    if (ltype.includes("Paternity") && gender !== "MALE")
      return res
        .status(200)
        .json({
          success: false,
          message: "Paternity Leave is only for Male employees.",
        });

    // Balance Check
    const currentYear = fromDate.getFullYear();
    const isLifetimeLeave =
      ltype.includes("Maternity") ||
      ltype.includes("Paternity") ||
      ltype.includes("SCL");
    let checkStart = `${currentYear}-01-01`,
      checkEnd = `${currentYear}-12-31`;
    if (isLifetimeLeave) {
      checkStart = new Date(emp.joindate).toISOString().split("T")[0];
      checkEnd = "2099-12-31";
    }

    const [usedRows] = await pool.execute(
      `
      SELECT SUM(no_of_days) as used FROM leave_app WHERE emp_id = ? AND ltype = ? AND l_status != 'Rejected' AND ((fdate BETWEEN ? AND ?) OR (tdate BETWEEN ? AND ?))
    `,
      [actualEmpId, ltype, checkStart, checkEnd, checkStart, checkEnd]
    );

    const usedSoFar = usedRows[0].used ? parseFloat(usedRows[0].used) : 0;
    const balanceRow = await leaveService.getOpeningBalance(
      actualEmpId,
      currentYear
    );

    let errorMsg = "";
    let dynamicLimit = rule ? parseFloat(rule.annual_limit) : 0;

    if (ltype.includes("Sick")) {
      // Sick Leave Units (1 Day = 2 Units)
      const OP_SL = balanceRow
        ? parseFloat(balanceRow.sl_opening)
        : dynamicLimit;
      const unitsLimit = isProbation ? 0 : OP_SL;
      if (usedSoFar * 2 + deductibleDays * 2 > unitsLimit)
        errorMsg = `Insufficient Sick Leave. Balance: ${Math.max(
          unitsLimit - usedSoFar * 2,
          0
        )} Units.`;
    } else if (ltype.includes("Casual") && !ltype.includes("Special")) {
      const OP_CL = balanceRow
        ? parseFloat(balanceRow.cl_opening)
        : dynamicLimit;
      let limit = OP_CL;
      // Pro-rata for Probation/Contractual
      if (isProbation || employeeType === "Contractual")
        limit = Math.floor(daysWorkedTotal / 45);
      if (usedSoFar + deductibleDays > limit)
        errorMsg = `Insufficient Casual Leave. Available: ${Math.max(
          limit - usedSoFar,
          0
        )} days.`;
    } else if (ltype.includes("Privilege")) {
      const OP_PL = balanceRow
        ? parseFloat(balanceRow.pl_opening)
        : dynamicLimit;
      let limit = OP_PL;
      if (employeeType === "Contractual") {
        const monthsService = Math.floor(daysWorkedTotal / 30);
        limit = Math.min(OP_PL, monthsService * 1);
      }
      if (usedSoFar + deductibleDays > limit)
        errorMsg = `Insufficient Privilege Leave. Available: ${Math.max(
          limit - usedSoFar,
          0
        )} days.`;
    } else {
      // Generic Check
      if (rule && usedSoFar + deductibleDays > dynamicLimit)
        errorMsg = `Limit Exceeded for ${ltype}. Allowed: ${dynamicLimit}, Used: ${usedSoFar}.`;
    }

    if (errorMsg && !ltype.includes("LWP") && !ltype.includes("Extraordinary"))
      return res.status(200).json({ success: false, message: errorMsg });

    // File Upload Requirement
    const requiresFile =
      (ltype.includes("Sick") && deductibleDays > 1) ||
      ltype.includes("Maternity") ||
      ltype.includes("Paternity") ||
      ltype.includes("SCL");
    let filePath = null;
    if (req.file) filePath = req.file.path.replace(/\\/g, "/");
    else if (requiresFile)
      return res
        .status(200)
        .json({
          success: false,
          message:
            "Medical Certificate/Document is mandatory for this request.",
        });

    // Insert into DB
    const leaveData = {
      emp_id: actualEmpId,
      ltype: ltype,
      fdate: fromDate.toISOString().split("T")[0],
      tdate: toDate.toISOString().split("T")[0],
      comment: input.comments || "",
      document_path: filePath,
      no_of_days: deductibleDays,
      shift_type: input.shift_type || null,
    };
    await leaveService.applyLeave(leaveData);

    // Email
    try {
      const userEmail = emp.email;
      const managerEmail = await leaveService.getEmployeeEmail(
        emp.reporting_manager
      );
      const directorEmails = await leaveService.getDirectorEmails();
      const recipients = [
        ...new Set(
          [userEmail, managerEmail, ...directorEmails].filter((e) => e)
        ),
      ];
      if (recipients.length > 0) {
        emailService.sendLeaveNotification(
          {
            empName: emp.ename,
            empCode: emp.usercode,
            ltype: leaveData.ltype,
            fdate: leaveData.fdate,
            tdate: leaveData.tdate,
            no_of_days: leaveData.no_of_days,
            comment: leaveData.comment,
          },
          recipients
        );
      }
    } catch (e) {
      console.error("Email failed", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Leave applied Successfully" });
  } catch (error) {
    console.error("Error applying leave:", error);
    res
      .status(500)
      .json({ success: false, message: "Database Error: " + error.message });
  }
};

// ==========================================
// 3. GET MANAGER LEAVES
// ==========================================
const getManagerLeaves = async (req, res) => {
  try {
    const { emp_id } = req.query; 
    console.log(`\n🔎 FETCHING APPROVALS for: ${emp_id}`);

    if (!emp_id) {
      return res.status(400).json({ success: false, message: "Missing emp_id" });
    }

    // A. Get Approver Info
    const approver = await leaveService.getApproverInfo(emp_id);
    
    if (!approver) {
      console.log("❌ Approver not found in DB");
      return res.status(200).json([]);
    }

    const dbEmpId = approver.emp_id;
    const dbUserCode = approver.usercode || emp_id;
    const dbName = approver.ename; // We need this for the Name check
    
    const userPost = approver.post || "";
    const isDirector = userPost.toLowerCase().includes("director");
    
    console.log(`   Approver: ${dbName} (ID: ${dbEmpId}, Code: ${dbUserCode})`);

    let teamIds = null;

    // B. Get Team Members
    // UPDATED: Pass ID, Code, AND Name
    if (!isDirector) {
      teamIds = await leaveService.getTeamIds(dbEmpId, dbUserCode, dbName);
      
      console.log(`   Team IDs found: ${teamIds || "None"}`);
      
      if (!teamIds) {
        // Debugging hint for you in the server console
        console.log("   ⚠️  No employees found where reporting_manager matches ID, Code, or Name.");
        return res.status(200).json([]);
      }
    }

    // C. Fetch Data
    const rawData = await leaveService.getPendingLeavesForApprover(isDirector, teamIds);
    console.log(`   Leaves Found: ${rawData.length}`);

    // D. Format Data
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const formattedData = rawData.map(row => {
      const filename = row.document_path ? row.document_path.split(/[/\\]/).pop() : null;
      const docUrl = filename ? `${baseUrl}/admin/leave_docs/${filename}` : null;

      return {
        leave_id: row.leave_id,
        ltype: row.ltype,
        fdate: row.fdate,
        tdate: row.tdate,
        comment: row.comment,
        document_path: docUrl,
        no_of_days: row.no_of_days,
        shift_type: row.shift_type,
        l_status: row.l_status,
        emp_name: row.emp_name
      };
    });

    res.status(200).json(formattedData);

  } catch (error) {
    console.error("❌ Error in getManagerLeaves:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ==========================================
// 4. PROCESS LEAVE UPDATE
// ==========================================
const processLeaveUpdate = async (req, res) => {
  try {
    const input = { ...req.query, ...req.body };
    const { leave_id, status, comments, emp_id } = input;
    if (!leave_id || !status || !emp_id)
      return res.status(400).json({ message: "Missing required fields" });

    const approver = await leaveService.getApproverInfo(emp_id);
    if (!approver)
      return res.status(404).json({ message: "Approver Not Found" });

    const approverName = approver.ename;
    const isDirector =
      approver.post && approver.post.toLowerCase().includes("director");

    let newStatusDb = "";
    let msg = "";
    if (status === "Cancelled") {
      newStatusDb = "Cancelled";
      msg = "Leave Rejected Successfully";
    } else {
      if (isDirector) {
        newStatusDb = "Approved";
        msg = "Final Approval Done";
      } else {
        newStatusDb = "Pending Director Approval";
        msg = "Approved & Forwarded to Director";
      }
    }

    await leaveService.updateLeaveStatus(
      leave_id,
      newStatusDb,
      comments || "",
      approverName,
      isDirector
    );

    // Status Email
    try {
      const leaveDetails = await leaveService.getLeaveDetailsById(leave_id);
      if (leaveDetails) {
        const userEmail = leaveDetails.user_email;
        const managerEmail = await leaveService.getEmployeeEmail(
          leaveDetails.reporting_manager
        );
        let directorEmails = [];
        if (!isDirector && status !== "Cancelled")
          directorEmails = await leaveService.getDirectorEmails();
        const recipients = [
          ...new Set(
            [userEmail, managerEmail, ...directorEmails].filter((e) => e)
          ),
        ];
        let emailStatusLabel =
          status === "Cancelled"
            ? "Rejected"
            : !isDirector
            ? "Pending Director Approval"
            : "Approved";
        if (recipients.length > 0)
          emailService.sendStatusUpdateEmail(
            leaveDetails,
            emailStatusLabel,
            approverName,
            comments || "No comments",
            recipients
          );
      }
    } catch (e) {}

    res.status(200).json({ message: msg });
  } catch (error) {
    res.status(500).json({ message: "Database Error: " + error.message });
  }
};

// ==========================================
// 5. GENERATE REPORT
// ==========================================
const generateLeaveReport = async (req, res) => {
  try {
    const { emp_id, from_date, to_date, status, format } = req.query;
    if (!emp_id || !from_date || !to_date)
      return res.status(400).json({ error: "Missing Parameters" });

    const rawData = await leaveService.getLeaveReportData(
      emp_id,
      from_date,
      to_date,
      status || "All"
    );

    const cleanedData = rawData.map((row) => {
      const newRow = { ...row };
      if (parseFloat(newRow["Days"]) === 0.5) newRow["Days"] = "0.5 (Half Day)";
      return newRow;
    });

    if (format === "csv") {
      const csvString = convertToCSV(cleanedData);
      const filename = `Leave_Report_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.status(200).send(csvString);
    } else {
      res.status(200).json(cleanedData);
    }
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
};

const getFullLeaveHistory = async (req, res) => {
  try {
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(200).json({ 
        status: false, 
        message: "Employee ID is required" 
      });
    }

    // Call the new service function
    const rawData = await leaveService.getAllLeavesForEmployee(emp_id);

    if (rawData.length > 0) {
      // Return raw data (frontend needs accurate ISO dates for comparison)
      return res.status(200).json({
        status: true,
        message: "History fetched successfully",
        data: rawData
      });
    } else {
      return res.status(200).json({
        status: false,
        message: "No leave history found",
        data: []
      });
    }

  } catch (error) {
    console.error("Error in getFullLeaveHistory:", error);
    return res.status(500).json({ 
      status: false, 
      message: "Server Error: " + error.message 
    });
  }
};

module.exports = {
  getLeaveHistory,
  applyLeave,
  getManagerLeaves,
  processLeaveUpdate,
  generateLeaveReport,
  getFullLeaveHistory,
};
