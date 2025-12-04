const leaveService = require("../services/leaveService");
const emailService = require("../services/emailService");
const { pool } = require("../config/database");

// ==========================================
// 1. GET LEAVE HISTORY
// ==========================================
const getLeaveHistory = async (req, res) => {
  try {
    const { emp_id, date } = req.body;

    if (!emp_id || !date) {
      return res.status(200).json({ status: false, message: "Missing Parameters" });
    }

    const rawData = await leaveService.getEmployeeLeavesByMonth(emp_id, date);

    if (rawData.length > 0) {
      const protocol = req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;

      const formatToDayMonth = (dateStr) => {
        return new Date(dateStr).toLocaleString('en-US', { 
          weekday: 'short', month: 'short', day: '2-digit' 
        });
      };

      const formattedData = rawData.map((row) => {
        const fdateObj = new Date(row.fdate);
        const tdateObj = new Date(row.tdate);
        const daysCount = (row.no_of_days && row.no_of_days > 0) ? parseFloat(row.no_of_days) : 1;

        let periodDisplay = "";
        if (daysCount === 0.5) {
          const shiftLabel = (row.shift_type === '2') ? "(2nd Half)" : "(1st Half)";
          periodDisplay = `${formatToDayMonth(row.fdate)} ${shiftLabel}`;
        } else if (fdateObj.getTime() === tdateObj.getTime()) {
          periodDisplay = formatToDayMonth(row.fdate);
        } else {
          periodDisplay = `${formatToDayMonth(row.fdate)} to ${formatToDayMonth(row.tdate)}`;
        }

        const filename = row.document_path ? row.document_path.split(/[/\\]/).pop() : null;
        const docUrl = filename ? `${baseUrl}/admin/leave_docs/${filename}` : null;

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
          document: docUrl
        };
      });

      res.status(200).json({ status: true, message: "Data Found", data: formattedData });
    } else {
      res.status(200).json({ status: false, message: "No Data Available", data: [] });
    }
  } catch (error) {
    console.error("Error in getLeaveHistory:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

// ==========================================
// 2. APPLY FOR LEAVE (Strict Logic)
// ==========================================
const applyLeave = async (req, res) => {
  try {
    const input = req.body;
    
    // 1. Basic Validation
    if (!input.emp_id || !input.ltype || !input.fromdate || !input.todate) {
      return res.status(200).json({ success: false, message: "Missing required fields" });
    }

    const isHalfDay = input.is_half_day === '1' || input.is_half_day === true;
    let fromDate = new Date(input.fromdate);
    let toDate = new Date(input.todate);
    const ltype = input.ltype;

    // 2. Fetch Employee Details
    const emp = await leaveService.getEmployeeDetails(input.emp_id);
    if (!emp) {
      return res.status(200).json({ success: false, message: "Employee not found" });
    }

    const actualEmpId = emp.emp_id;
    const joinDate = new Date(emp.joindate);
    const isSaturdayWorking = emp.is_saturday_working ? emp.is_saturday_working.trim().toUpperCase() : 'NO';
    const gender = emp.gender ? emp.gender.toUpperCase() : 'MALE';

    // 3. Probation Logic
    const probationEndDate = new Date(joinDate);
    probationEndDate.setFullYear(probationEndDate.getFullYear() + 1);
    
    // Calculate Days Worked
    const diffTime = Math.abs(fromDate - joinDate);
    const daysWorkedTotal = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const isProbation = new Date() <= probationEndDate;

    // 4. Calculate Deductible Days
    let deductibleDays = 0;

    if (isHalfDay) {
      deductibleDays = 0.5;
      toDate = fromDate; 
    } else {
      // Casual Leave: Exclude Sundays and Holidays logic
      if (ltype.includes('Casual') && !ltype.includes('Special')) {
        let current = new Date(fromDate);
        const end = new Date(toDate);
        
        while (current <= end) {
          const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
          
          let countDay = true;
          if (dayOfWeek === 0) countDay = false; // Skip Sunday
          if (dayOfWeek === 6 && isSaturdayWorking !== 'YES') countDay = false; // Skip Sat if not working

          if (countDay) deductibleDays++;
          
          current.setDate(current.getDate() + 1);
        }
      } else {
        // PL, SL, Mat, Pat: Include all intervening days
        const diff = Math.abs(toDate - fromDate);
        deductibleDays = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    // 5. VALIDATION RULES (Matching NIA Policy)

    // A. Probation Check
    if (isProbation && (ltype.includes('Privilege') || ltype.includes('Sick'))) {
      return res.status(200).json({ success: false, message: "Probation Rule: Privilege and Sick Leave are not allowed during probation." });
    }

    // B. Casual Leave Max Limit
    if (ltype.includes('Casual') && !ltype.includes('Special') && deductibleDays > 5) {
      return res.status(200).json({ success: false, message: "Casual Leave cannot exceed 5 consecutive days." });
    }

    // C. Privilege Leave Min Limit
    if (ltype.includes('Privilege') && deductibleDays < 5) {
      return res.status(200).json({ success: false, message: "Privilege Leave must be a minimum of 5 days." });
    }

    // D. Gender Checks
    if (ltype.includes('Maternity') && gender !== 'FEMALE') {
      return res.status(200).json({ success: false, message: "Maternity Leave is only for Female employees." });
    }
    if (ltype.includes('Paternity') && gender !== 'MALE') {
      return res.status(200).json({ success: false, message: "Paternity Leave is only for Male employees." });
    }

    // 6. BALANCE & LIMIT CHECK
    const currentYear = fromDate.getFullYear();
    const isLifetimeLeave = ltype.includes('Maternity') || ltype.includes('Paternity') || ltype.includes('SCL') || ltype.includes('Special');

    // Determine Check Range
    let checkStart = `${currentYear}-01-01`;
    let checkEnd = `${currentYear}-12-31`;
    if (isLifetimeLeave) {
      checkStart = new Date(emp.joindate).toISOString().split('T')[0];
      checkEnd = '2099-12-31';
    }

    // Fetch Usage via Service
    const [usedRows] = await pool.execute(`
      SELECT SUM(no_of_days) as used 
      FROM leave_app 
      WHERE emp_id = ? AND ltype = ? AND l_status != 'Rejected'
      AND ((fdate BETWEEN ? AND ?) OR (tdate BETWEEN ? AND ?))
    `, [actualEmpId, ltype, checkStart, checkEnd, checkStart, checkEnd]);
    
    const usedSoFar = usedRows[0].used ? parseFloat(usedRows[0].used) : 0;

    // Fetch Opening Balance
    const balanceRow = await leaveService.getOpeningBalance(actualEmpId, currentYear);

    // --- Strict Balance Logic ---
    let errorMsg = "";

    if (ltype.includes('Sick')) {
      // SICK LEAVE (Units Logic: 1 Day = 2 Units)
      const OP_SL = balanceRow ? parseFloat(balanceRow.sl_opening) : 20;
      const unitsLimit = isProbation ? 0 : OP_SL;
      
      const unitsUsed = usedSoFar * 2;
      const unitsRequested = deductibleDays * 2;

      if ((unitsUsed + unitsRequested) > unitsLimit) {
        const leftUnits = Math.max(unitsLimit - unitsUsed, 0);
        const leftDays = leftUnits / 2;
        errorMsg = `Insufficient Sick Leave. Balance: ${leftUnits} Units (${leftDays} Days).`;
      }

    } else if (ltype.includes('Casual') && !ltype.includes('Special')) {
      // CASUAL LEAVE
      const OP_CL = balanceRow ? parseFloat(balanceRow.cl_opening) : 8;
      const limit = isProbation ? Math.floor(daysWorkedTotal / 45) : OP_CL;

      if ((usedSoFar + deductibleDays) > limit) {
        const left = Math.max(limit - usedSoFar, 0);
        errorMsg = `Insufficient Casual Leave. Available: ${left} days.`;
      }

    } else if (ltype.includes('Privilege')) {
      // PRIVILEGE LEAVE
      const OP_PL = balanceRow ? parseFloat(balanceRow.pl_opening) : 0;
      const limit = isProbation ? 0 : OP_PL;

      if ((usedSoFar + deductibleDays) > limit) {
        const left = Math.max(limit - usedSoFar, 0);
        errorMsg = `Insufficient Privilege Leave. Available: ${left} days.`;
      }

    } else if (ltype.includes('Maternity')) {
      // MATERNITY
      if (ltype.includes('Pregnancy')) {
        if (deductibleDays > 180) errorMsg = "Maternity (Pregnancy) max 180 days per occasion.";
        else if ((usedSoFar + deductibleDays) > 360) errorMsg = "Lifetime Maternity limit (360 days) exceeded.";
      } else if (ltype.includes('Abortion')) {
        if ((usedSoFar + deductibleDays) > 45) errorMsg = "Lifetime Abortion/Miscarriage limit (45 days) exceeded.";
      }
    } else if (ltype.includes('Paternity')) {
      if (deductibleDays > 15) errorMsg = "Paternity leave max 15 days.";
    } else if (ltype.includes('Vasectomy')) {
      // Dynamic SCL limit
      const limit = (usedSoFar >= 6) ? 12 : 6;
      if (deductibleDays > (limit - usedSoFar)) errorMsg = "Vasectomy limit exceeded.";
    }

    if (errorMsg && !ltype.includes('LWP')) {
      return res.status(200).json({ success: false, message: errorMsg });
    }

    // 7. File Upload Path & Validation
    const requiresFile = (ltype.includes('Sick') && deductibleDays > 1) || 
                         ltype.includes('Maternity') || 
                         ltype.includes('Paternity') || 
                         ltype.includes('SCL') || 
                         ltype.includes('Special');

    let filePath = null;
    if (req.file) {
      filePath = req.file.path.replace(/\\/g, "/"); 
    } else if (requiresFile) {
      return res.status(200).json({ success: false, message: "Medical Certificate/Document is mandatory for this request." });
    }

    // 8. Insert into Database
    const leaveData = {
      emp_id: actualEmpId,
      ltype: ltype,
      fdate: fromDate.toISOString().split('T')[0],
      tdate: toDate.toISOString().split('T')[0],
      comment: input.comments || '',
      document_path: filePath,
      no_of_days: deductibleDays,
      shift_type: input.shift_type || null
    };

    await leaveService.applyLeave(leaveData);

    // 9. Send Email Notifications
    try {
      const userEmail = emp.email;
      const managerEmail = await leaveService.getEmployeeEmail(emp.reporting_manager);
      const directorEmails = await leaveService.getDirectorEmails();

      const recipients = [...new Set([userEmail, managerEmail, ...directorEmails].filter(e => e))];

      if (recipients.length > 0) {
        emailService.sendLeaveNotification({
          empName: emp.ename, empCode: emp.usercode,
          ltype: leaveData.ltype, fdate: leaveData.fdate, tdate: leaveData.tdate,
          no_of_days: leaveData.no_of_days, comment: leaveData.comment
        }, recipients);
      }
    } catch (e) { console.error("Email failed", e.message); }

    res.status(200).json({ success: true, message: "Leave applied Successfully" });

  } catch (error) {
    console.error("Error applying leave:", error);
    res.status(500).json({ success: false, message: "Database Error: " + error.message });
  }
};

// ==========================================
// 3. GET MANAGER/DIRECTOR LEAVES
// ==========================================
const getManagerLeaves = async (req, res) => {
  try {
    const { emp_id } = req.query; 

    if (!emp_id) {
      return res.status(400).json({ success: false, message: "Missing emp_id" });
    }

    const approver = await leaveService.getApproverInfo(emp_id);
    if (!approver) {
      return res.status(200).json([]);
    }

    const dbEmpId = approver.emp_id;
    const userPost = approver.post || "";
    const isDirector = userPost.toLowerCase().includes("director");
    let teamIds = null;

    if (!isDirector) {
      teamIds = await leaveService.getTeamIds(dbEmpId);
      if (!teamIds) {
        return res.status(200).json([]);
      }
    }

    const rawData = await leaveService.getPendingLeavesForApprover(isDirector, teamIds);

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
    console.error("Error in getManagerLeaves:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ==========================================
// 4. UPDATE LEAVE STATUS (Approve/Reject)
// ==========================================
const processLeaveUpdate = async (req, res) => {
  try {
    const input = { ...req.query, ...req.body };
    const { leave_id, status, comments, emp_id } = input;

    if (!leave_id || !status || !emp_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const approver = await leaveService.getApproverInfo(emp_id);
    if (!approver) {
      return res.status(404).json({ message: "Approver Not Found" });
    }

    const approverName = approver.ename;
    const userPost = approver.post || "";
    const isDirector = userPost.toLowerCase().includes("director");

    // Determine New Status
    let newStatusDb = "";
    let msg = "";

    if (status === 'Cancelled') {
      newStatusDb = 'Cancelled'; // Converted to 'Rejected' in service
      msg = "Leave Rejected Successfully";
    } else {
      if (isDirector) {
        newStatusDb = 'Approved'; // Final
        msg = "Final Approval Done";
      } else {
        newStatusDb = 'Pending Director Approval'; // Intermediate
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

    // Send Email
    try {
      const leaveDetails = await leaveService.getLeaveDetailsById(leave_id);

      if (leaveDetails) {
        const userEmail = leaveDetails.user_email;
        const managerEmail = await leaveService.getEmployeeEmail(leaveDetails.reporting_manager);
        
        let directorEmails = [];
        if (!isDirector && status !== 'Cancelled') {
             directorEmails = await leaveService.getDirectorEmails();
        }

        const recipients = [...new Set([userEmail, managerEmail, ...directorEmails].filter(e => e))];

        let emailStatusLabel = "Approved";
        if (status === 'Cancelled') emailStatusLabel = "Rejected";
        else if (!isDirector) emailStatusLabel = "Pending Director Approval (Manager Approved)";

        if (recipients.length > 0) {
          emailService.sendStatusUpdateEmail(
            leaveDetails, 
            emailStatusLabel, 
            approverName, 
            comments || "No comments", 
            recipients
          );
        }
      }
    } catch (emailErr) {
      console.error("⚠️ Status Email Failed:", emailErr.message);
    }

    res.status(200).json({ message: msg });

  } catch (error) {
    console.error("Error in processLeaveUpdate:", error);
    res.status(500).json({ message: "Database Error: " + error.message });
  }
};

// Helper: Convert JSON Array to CSV String
const convertToCSV = (arr) => {
  if (!arr || !arr.length) return "";
  const headers = Object.keys(arr[0]).join(",");
  const rows = arr.map(obj => 
    Object.values(obj).map(val => {
      // Escape quotes and wrap in quotes if contains comma
      const str = String(val === null ? "" : val);
      return `"${str.replace(/"/g, '""')}"`; 
    }).join(",")
  );
  return [headers, ...rows].join("\n");
};

// ==========================================
// 5. GENERATE LEAVE REPORT (JSON/CSV)
// ==========================================
const generateLeaveReport = async (req, res) => {
  try {
    const { emp_id, from_date, to_date, status, format } = req.query;

    // 1. Validation
    if (!emp_id || !from_date || !to_date) {
      return res.status(400).json({ error: "Missing Parameters (emp_id, from_date, to_date)" });
    }

    // 2. Fetch Data
    const rawData = await leaveService.getLeaveReportData(emp_id, from_date, to_date, status || 'All');

    // 3. Clean Data (Handle 0.5 display)
    const cleanedData = rawData.map(row => {
      // Clone row to avoid mutating reference
      const newRow = { ...row };
      if (parseFloat(newRow['Days']) === 0.5) {
        newRow['Days'] = '0.5 (Half Day)';
      }
      return newRow;
    });

    // 4. Output Logic
    if (format === 'csv') {
      // CSV DOWNLOAD
      const csvString = convertToCSV(cleanedData);
      const filename = `Leave_Report_${new Date().toISOString().slice(0,10)}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvString);

    } else {
      // JSON RESPONSE (Default)
      res.status(200).json(cleanedData);
    }

  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = {
  getLeaveHistory,
  applyLeave,
  getManagerLeaves,
  processLeaveUpdate,
  generateLeaveReport
};