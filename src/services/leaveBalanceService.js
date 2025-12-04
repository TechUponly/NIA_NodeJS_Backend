const { pool } = require("../config/database");

const getEmployeeDetails = async (empId) => {
  const query = "SELECT joindate, gender FROM employee WHERE emp_id = ? LIMIT 1";
  const [rows] = await pool.execute(query, [empId]);
  return rows[0];
};

const getOpeningBalance = async (empId, year) => {
  const query = "SELECT * FROM leave_balance WHERE emp_id = ? AND year = ?";
  const [rows] = await pool.execute(query, [empId, year]);
  return rows[0];
};

// Fetches leaves taken within a specific date range (Current Year)
const getAnnualLeavesTaken = async (empId, startDate, endDate) => {
  const query = `
    SELECT ltype, SUM(no_of_days) as days_taken 
    FROM leave_app 
    WHERE emp_id = ? 
    AND l_status IN ('Approved', '', 'Pending') 
    AND (fdate BETWEEN ? AND ?)
    GROUP BY ltype
  `;
  const [rows] = await pool.execute(query, [empId, startDate, endDate]);
  return rows;
};

// Fetches leaves taken over entire history (Lifetime)
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

module.exports = {
  getEmployeeDetails,
  getOpeningBalance,
  getAnnualLeavesTaken,
  getLifetimeLeavesTaken
};