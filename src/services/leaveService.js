const { pool } = require("../config/database");

// ==========================================
// 1. CONFIGURATION & HELPERS
// ==========================================

// Fetch Leave Rules from DB based on User Type
const getLeaveConfiguration = async (employeeType) => {
  // Default to 'Core' if null
  const type = employeeType || 'Core';
  const query = `
    SELECT leave_type, annual_limit, max_per_request, min_per_request 
    FROM leave_configurations 
    WHERE user_type = ? AND is_active = 1
  `;
  const [rows] = await pool.execute(query, [type]);
  return rows;
};

// ==========================================
// 2. EMPLOYEE & LEAVE DATA FETCHING
// ==========================================

// Fetch Full Employee Details
const getEmployeeDetails = async (empId) => {
  const query = `
    SELECT emp_id, usercode, ename, gender, joindate, is_saturday_working, email, reporting_manager, employee_type 
    FROM employee 
    WHERE usercode = ? OR emp_id = ? 
    LIMIT 1
  `;
  const [rows] = await pool.execute(query, [empId, empId]);
  return rows[0];
};

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
// 3. BALANCE CALCULATION HELPERS
// ==========================================

// Fetch Opening Balances from 'leave_balance' table
const getOpeningBalance = async (empId, year) => {
  const query = "SELECT * FROM leave_balance WHERE emp_id = ? AND year = ?";
  const [rows] = await pool.execute(query, [empId, year]);
  return rows[0];
};

// Fetch Annual Used Leaves (CL, PL, SL)
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
// 4. APPLY LEAVE (INSERT)
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
// 5. MANAGER & DIRECTOR APPROVALS
// ==========================================

// Get Approver Info (Role Check)
const getApproverInfo = async (userCode) => {
  const query = "SELECT emp_id, ename, post, mobile_app_level FROM employee WHERE usercode = ?";
  const [rows] = await pool.execute(query, [userCode]);
  return rows[0];
};

// Get Team Members for a Manager
const getTeamIds = async (managerId, managerUserCode, managerName) => {
  const query = `
    SELECT GROUP_CONCAT(emp_id) as ids 
    FROM employee 
    WHERE reporting_manager = ?       -- Check ID (e.g. 5)
       OR reporting_manager = ?       -- Check Code (e.g. 'C005')
       OR reporting_manager = ?       -- Check Name (e.g. 'Amit Kumar')
  `;
  // Pass all three variations
  const [rows] = await pool.execute(query, [managerId, managerUserCode, managerName]);
  return rows[0].ids;
};

// Fetch Pending Leaves for Manager/Director Dashboard
const getPendingLeavesForApprover = async (isDirector, teamIds) => {
  let query = "";
  
  if (isDirector) {
    // DIRECTOR VIEW: 
    // 1. All 'Pending Director Approval'
    // 2. PLUS 'Pending' if it's their own direct report
    
    let teamCondition = "";
    if (teamIds) {
      teamCondition = `OR (l.emp_id IN (${teamIds}) AND l.l_status = 'Pending')`;
    }

    query = `
      SELECT 
        l.leave_id, l.ltype, l.fdate, l.tdate, l.comment, l.document_path, 
        l.no_of_days, l.shift_type, l.l_status,
        e.ename as emp_name
      FROM leave_app l
      JOIN employee e ON l.emp_id = e.emp_id
      WHERE 
        (l.l_status = 'Pending Director Approval')
        ${teamCondition}
      ORDER BY l.leave_id DESC
    `;
  } else {
    // MANAGER VIEW: Only see Team's Pending leaves
    if (!teamIds) return []; 
    
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
// 6. EMAIL & REPORTING
// ==========================================

const getEmployeeEmail = async (empId) => {
  if (!empId) return null;
  const query = "SELECT email FROM employee WHERE emp_id = ?";
  const [rows] = await pool.execute(query, [empId]);
  return rows[0] ? rows[0].email : null;
};

const getDirectorEmails = async () => {
  const query = "SELECT email FROM employee WHERE post LIKE '%Director%'";
  const [rows] = await pool.execute(query);
  return rows.map(r => r.email);
};

// Report Generation with Strict Access Control
const getLeaveReportData = async (empId, fromDate, toDate, statusFilter) => {
  const userQuery = `SELECT emp_id, admin_type, post FROM employee WHERE usercode = ? LIMIT 1`;
  const [userRows] = await pool.execute(userQuery, [empId]);
  
  if (userRows.length === 0) return [];
  const currentUser = userRows[0];
  
  const isAdmin = String(currentUser.admin_type) === '1';
  const isDirector = currentUser.post && currentUser.post.toLowerCase().includes('director');

  let whereClause = "";
  let params = [];

  if (isAdmin || isDirector) {
    // Admin/Director: View All
    whereClause = "WHERE 1=1"; 
  } 
  else {
    // Manager: View Team Only (Not Self, Not others)
    const teamQuery = "SELECT GROUP_CONCAT(emp_id) as ids FROM employee WHERE reporting_manager = ?";
    const [teamRows] = await pool.execute(teamQuery, [currentUser.emp_id]);
    
    let teamIds = teamRows[0].ids;

    if (teamIds) {
      // Add manager's own ID to list if you want them to see their own report
      const idsToList = `${teamIds},${currentUser.emp_id}`;
      whereClause = `WHERE l.emp_id IN (${idsToList})`;
    } else {
      // Regular user: See only self
      whereClause = "WHERE l.emp_id = ?";
      params.push(currentUser.emp_id);
    }
  }

  whereClause += " AND (l.fdate BETWEEN ? AND ?)";
  params.push(fromDate, toDate);

  if (statusFilter && statusFilter !== 'All') {
    whereClause += " AND l.l_status = ?";
    params.push(statusFilter);
  }

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

// Fetch All Leave Applications for an Employee (History)
const getAllLeavesForEmployee = async (empId) => {
  const query = `
    SELECT 
      leave_id, 
      ltype, 
      fdate, 
      tdate, 
      l_status, 
      no_of_days, 
      shift_type,
      apply_date,
      comment
    FROM leave_app 
    WHERE emp_id = ? 
    ORDER BY fdate DESC
  `;
  const [rows] = await pool.execute(query, [empId]);
  return rows;
};

module.exports = {
  getLeaveConfiguration,
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
  getLeaveReportData,
  getAllLeavesForEmployee,
};