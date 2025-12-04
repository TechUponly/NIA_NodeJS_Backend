const { pool } = require("../config/database");

// ==========================================
// 1. LEAVE HISTORY & DETAILS
// ==========================================

// Fetch Leave History for a specific month/year
const getEmployeeLeavesByMonth = async (empId, date) => {
  try {
    const query = `
      SELECT * FROM leave_app 
      WHERE emp_id = ? 
      AND MONTH(fdate) = MONTH(?) 
      AND YEAR(fdate) = YEAR(?)
      ORDER BY fdate DESC
    `;
    const [rows] = await pool.execute(query, [empId, date, date]);
    return rows;
  } catch (error) {
    throw error;
  }
};

// Fetch Full Employee Details (for Application & Rules)
const getEmployeeDetails = async (empId) => {
  const query = `
    SELECT emp_id, usercode, ename, gender, joindate, is_saturday_working, email, reporting_manager 
    FROM employee 
    WHERE usercode = ? OR emp_id = ? 
    LIMIT 1
  `;
  const [rows] = await pool.execute(query, [empId, empId]);
  return rows[0];
};

// Fetch specific Leave Application details (for Email Notifications)
const getLeaveDetailsById = async (leaveId) => {
  const query = `
    SELECT 
      l.*, 
      e.ename, 
      e.usercode, 
      e.email as user_email, 
      e.reporting_manager 
    FROM leave_app l
    JOIN employee e ON l.emp_id = e.emp_id
    WHERE l.leave_id = ?
  `;
  const [rows] = await pool.execute(query, [leaveId]);
  return rows[0];
};

// ==========================================
// 2. BALANCE CALCULATION HELPERS
// ==========================================

// Fetch Opening Balances from 'leave_balance' table
const getOpeningBalance = async (empId, year) => {
  const query = "SELECT * FROM leave_balance WHERE emp_id = ? AND year = ?";
  const [rows] = await pool.execute(query, [empId, year]);
  return rows[0];
};

// Fetch Used Leaves (Annual: CL, PL, SL)
const getAnnualLeavesTaken = async (empId, year) => {
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const query = `
    SELECT ltype, SUM(no_of_days) as days_taken 
    FROM leave_app 
    WHERE emp_id = ? 
    AND l_status IN ('Approved', '', 'Pending') 
    AND (fdate BETWEEN ? AND ?)
    GROUP BY ltype
  `;
  
  const [rows] = await pool.execute(query, [empId, startOfYear, endOfYear]);
  return rows;
};

// Fetch Lifetime Used Leaves (Maternity, Paternity, SCL)
const getLifetimeLeavesTaken = async (empId) => {
  const query = `
    SELECT ltype, SUM(no_of_days) as days_taken 
    FROM leave_app 
    WHERE emp_id = ? 
    AND l_status IN ('Approved', '', 'Pending') 
    GROUP BY ltype
  `;
  const [rows] = await pool.execute(query, [empId]);
  return rows;
};

// Legacy Helper: Check Balance for specific type (used in Apply Leave logic)
const getUsedLeaveCount = async (empId, ltype, year) => {
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const query = `
    SELECT SUM(no_of_days) as used 
    FROM leave_app 
    WHERE emp_id = ? 
    AND ltype = ? 
    AND l_status != 'Rejected'
    AND ((fdate BETWEEN ? AND ?) OR (tdate BETWEEN ? AND ?))
  `;
  
  const [rows] = await pool.execute(query, [empId, ltype, startOfYear, endOfYear, startOfYear, endOfYear]);
  return rows[0].used ? parseFloat(rows[0].used) : 0;
};

// ==========================================
// 3. APPLY LEAVE (INSERT)
// ==========================================

const applyLeave = async (leaveData) => {
  // Uses '1970-01-01' as placeholder for NOT NULL approved_date
  // Uses '' for NOT NULL admincomment
  const query = `
    INSERT INTO leave_app (
      emp_id, ltype, fdate, tdate, comment, document_path, no_of_days, shift_type, 
      l_status, admincomment, approved_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', '', '1970-01-01')
  `;

  const values = [
    leaveData.emp_id,
    leaveData.ltype,
    leaveData.fdate,
    leaveData.tdate,
    leaveData.comment,
    leaveData.document_path || null,
    leaveData.no_of_days,
    leaveData.shift_type || null
  ];

  const [result] = await pool.execute(query, values);
  return result;
};

// ==========================================
// 4. MANAGER & DIRECTOR APPROVALS
// ==========================================

// Get Approver Info (Role Check)
const getApproverInfo = async (userCode) => {
  const query = "SELECT emp_id, ename, post, mobile_app_level FROM employee WHERE usercode = ?";
  const [rows] = await pool.execute(query, [userCode]);
  return rows[0];
};

// Get Team Members for a Manager
const getTeamIds = async (managerId) => {
  const query = "SELECT GROUP_CONCAT(emp_id) as ids FROM employee WHERE reporting_manager = ?";
  const [rows] = await pool.execute(query, [managerId]);
  return rows[0].ids;
};

// Fetch Pending Leaves for Manager/Director Dashboard
const getPendingLeavesForApprover = async (isDirector, teamIds) => {
  let query = "";
  
  if (isDirector) {
    // DIRECTOR VIEW
    query = `
      SELECT 
        l.leave_id, l.ltype, l.fdate, l.tdate, l.comment, l.document_path, 
        l.no_of_days, l.shift_type, l.l_status,
        e.ename as emp_name
      FROM leave_app l
      JOIN employee e ON l.emp_id = e.emp_id
      WHERE l.l_status = 'Pending Director Approval'
      ORDER BY l.leave_id DESC
    `;
  } else {
    // MANAGER VIEW
    if (!teamIds) return []; 
    // Note: teamIds is a CSV string from GROUP_CONCAT, safe to inject here as it comes from DB
    query = `
      SELECT 
        l.leave_id, l.ltype, l.fdate, l.tdate, l.comment, l.document_path, 
        l.no_of_days, l.shift_type, l.l_status,
        e.ename as emp_name
      FROM leave_app l
      JOIN employee e ON l.emp_id = e.emp_id
      WHERE l.emp_id IN (${teamIds}) 
      AND l.l_status = 'Pending'
      ORDER BY l.leave_id DESC
    `;
  }

  const [rows] = await pool.execute(query);
  return rows;
};

// Update Leave Status (Approve/Reject)
const updateLeaveStatus = async (leaveId, status, comments, approverName, isDirector) => {
  let query = "";
  let params = [];

  // Logic 1: REJECTION (Cancelled)
  if (status === 'Cancelled') {
    query = `
      UPDATE leave_app SET 
        l_status = 'Rejected', 
        level1_status = 'Rejected', 
        level2_status = 'Rejected', 
        admincomment = CONCAT(IFNULL(admincomment,''), ?) 
      WHERE leave_id = ?
    `;
    const commentString = ` | Rejected by ${approverName}: ${comments}`;
    params = [commentString, leaveId];
  } 
  // Logic 2: APPROVAL
  else {
    if (isDirector) {
      // Director = Final Approval
      const currentDate = new Date().toISOString().split('T')[0];
      query = `
        UPDATE leave_app SET 
          l_status = 'Approved', 
          level2_status = 'Approved', 
          approved_date = ?, 
          approved_by = ?, 
          admincomment = CONCAT(IFNULL(admincomment,''), ?) 
        WHERE leave_id = ?
      `;
      const commentString = ` | Director Approved: ${comments}`;
      params = [currentDate, approverName, commentString, leaveId];
    } else {
      // Manager = Intermediate Approval
      query = `
        UPDATE leave_app SET 
          l_status = 'Pending Director Approval', 
          level1_status = 'Approved', 
          admincomment = CONCAT(IFNULL(admincomment,''), ?) 
        WHERE leave_id = ?
      `;
      const commentString = ` | Manager Approved: ${comments}`;
      params = [commentString, leaveId];
    }
  }

  const [result] = await pool.execute(query, params);
  return result;
};

// ==========================================
// 5. EMAIL HELPERS
// ==========================================

// Get Email Address of a specific Employee ID (For Manager)
const getEmployeeEmail = async (empId) => {
  if (!empId) return null;
  const query = "SELECT email FROM employee WHERE emp_id = ?";
  const [rows] = await pool.execute(query, [empId]);
  return rows[0] ? rows[0].email : null;
};

// Get Director Email(s)
const getDirectorEmails = async () => {
  const query = "SELECT email FROM employee WHERE post LIKE '%Director%'";
  const [rows] = await pool.execute(query);
  return rows.map(r => r.email);
};

// ==========================================
// REPORT GENERATION LOGIC
// ==========================================
const getLeaveReportData = async (empId, fromDate, toDate, statusFilter) => {
  // 1. Get Logged-in User's Details
  const userQuery = `
    SELECT emp_id, admin_type, post 
    FROM employee 
    WHERE usercode = ? 
    LIMIT 1
  `;
  const [userRows] = await pool.execute(userQuery, [empId]);
  
  if (userRows.length === 0) return []; // User not found
  const currentUser = userRows[0];
  
  // 2. Define Permissions
  // Strict check: admin_type must be string '1'
  const isAdmin = String(currentUser.admin_type) === '1';
  const isDirector = currentUser.post && currentUser.post.toLowerCase().includes('director');

  let whereClause = "";
  let params = [];

  // 3. Build Access Logic
  if (isAdmin || isDirector) {
    // ------------------------------------------
    // CASE A: ADMIN / DIRECTOR -> VIEW ALL
    // ------------------------------------------
    whereClause = "WHERE 1=1"; 
  } 
  else {
    // ------------------------------------------
    // CASE B: MANAGER -> VIEW SUBORDINATES ONLY
    // ------------------------------------------
    
    // Find employees who report TO this user
    const teamQuery = "SELECT GROUP_CONCAT(emp_id) as ids FROM employee WHERE reporting_manager = ?";
    const [teamRows] = await pool.execute(teamQuery, [currentUser.emp_id]);
    
    let teamIds = teamRows[0].ids;

    if (teamIds) {
      // Logic: Only show employees listed in teamIds.
      // We do NOT add currentUser.emp_id here, so the manager does not see their own leaves in this report.
      whereClause = `WHERE l.emp_id IN (${teamIds})`;
    } else {
      // ------------------------------------------
      // CASE C: REGULAR USER -> NO ACCESS
      // ------------------------------------------
      // If the user is not Admin/Director and has no team members reporting to them,
      // they should see NOTHING.
      return []; 
    }
  }

  // 4. Apply Common Filters (Date & Status)
  whereClause += " AND (l.fdate BETWEEN ? AND ?)";
  params.push(fromDate, toDate);

  if (statusFilter && statusFilter !== 'All') {
    whereClause += " AND l.l_status = ?";
    params.push(statusFilter);
  }

  // 5. Execute Final Query
  const sql = `
    SELECT 
      e.usercode as 'Employee ID',
      e.ename as 'Employee Name',
      e.department as 'Department',
      l.ltype as 'Leave Type',
      DATE_FORMAT(l.fdate, '%Y-%m-%d') as 'From Date',
      DATE_FORMAT(l.tdate, '%Y-%m-%d') as 'To Date',
      l.no_of_days as 'Days',
      l.l_status as 'Status',
      DATE_FORMAT(l.apply_date, '%Y-%m-%d') as 'Applied On',
      l.comment as 'Reason',
      l.approved_by as 'Approved By'
    FROM leave_app l
    JOIN employee e ON l.emp_id = e.emp_id
    ${whereClause}
    ORDER BY l.fdate DESC
  `;

  const [rows] = await pool.execute(sql, params);
  return rows;
};

module.exports = {
  getEmployeeLeavesByMonth,
  getEmployeeDetails,
  getLeaveDetailsById,
  getOpeningBalance,
  getAnnualLeavesTaken,
  getLifetimeLeavesTaken,
  getUsedLeaveCount,
  applyLeave,
  getApproverInfo,
  getTeamIds,
  getPendingLeavesForApprover,
  updateLeaveStatus,
  getEmployeeEmail,
  getDirectorEmails,
  getLeaveReportData
};