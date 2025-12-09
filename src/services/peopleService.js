const { pool } = require("../config/database");

// 1. Get Current User Details
const getEmployeeByCode = async (userCode) => {
  const query = `
    SELECT emp_id, ename as name, emp_code, post, mno, official_mail, dob, city, joindate, department, passphoto as profileimg, gender 
    FROM employee 
    WHERE usercode = ? AND active_inactive_status = 'Active'
  `;
  const [rows] = await pool.execute(query, [userCode]);
  return rows[0];
};

// 2. Get Manager Details (via employee_mapping)
const getManagerByEmpId = async (empId) => {
  // Logic: Find the mapped_emp_id for this employee, then fetch that manager's details
  const query = `
    SELECT e.emp_id, e.ename as name, e.emp_code, e.post, e.mno, e.official_mail, e.dob, e.city, e.joindate, e.department, e.passphoto as profileimg, e.gender
    FROM employee_mapping m
    JOIN employee e ON m.mapped_emp_id = e.emp_id
    WHERE m.emp_id = ? AND e.active_inactive_status = 'Active'
  `;
  const [rows] = await pool.execute(query, [empId]);
  return rows[0];
};

// 3. Get Subordinates (Team)
const getSubordinatesByManagerId = async (managerId) => {
  // Logic: Find all employees where mapped_emp_id = current user
  const query = `
    SELECT e.ename, e.emp_id, e.post, e.ns, e.mobile_app_level, e.mno, e.official_mail, e.passphoto as profileimg, e.gender
    FROM employee_mapping m
    JOIN employee e ON m.emp_id = e.emp_id
    WHERE m.mapped_emp_id = ? AND e.active_inactive_status = 'Active'
  `;
  const [rows] = await pool.execute(query, [managerId]);
  return rows;
};

module.exports = {
  getEmployeeByCode,
  getManagerByEmpId,
  getSubordinatesByManagerId
};