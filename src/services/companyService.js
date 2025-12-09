const { pool } = require("../config/database");

// 1. Get List of Companies (Hardcoded or DB based)
const getCompanyList = async () => {
  // If you want to fetch from DB later, you can change this.
  // For now, matching your PHP hardcoded values:
  const companies = [
    { id: 1, name: "National Insurance Academy" }
  ];
  return companies;
};

// 2. Get Departments by Org Name
const getDepartmentsByOrg = async (orgName) => {
  try {
    // ⚠️ IMPORTANT: Make sure the table 'hrms_department_new' exists in your MySQL DB
    const query = `
      SELECT DISTINCT department 
      FROM hrms_department_new 
      WHERE org_name = ? 
      ORDER BY department ASC
    `;
    
    // We use [orgName] to prevent SQL injection
    const [rows] = await pool.execute(query, [orgName]);
    return rows;
  } catch (error) {
    throw error;
  }
};

const getDesignationsByDept = async (department) => {
  try {
    const query = `
      SELECT DISTINCT designation 
      FROM hrms_designation_new 
      WHERE department = ? 
      ORDER BY designation ASC
    `;
    const [rows] = await pool.execute(query, [department]);
    return rows;
  } catch (error) {
    throw error;
  }
};

const getBandsByDesignation = async (designation) => {
  try {
    const query = `
      SELECT DISTINCT band 
      FROM band 
      WHERE designation = ? 
      ORDER BY band ASC
    `;
    const [rows] = await pool.execute(query, [designation]);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getCompanyList,
  getDepartmentsByOrg,
  getDesignationsByDept,
  getBandsByDesignation,
};