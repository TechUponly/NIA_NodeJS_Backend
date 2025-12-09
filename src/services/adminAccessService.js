const { pool } = require("../config/database");

const getEmployeeByCode = async (userCode) => {
  const query = "SELECT * FROM employee WHERE usercode = ?";
  const [rows] = await pool.execute(query, [userCode]);
  return rows[0];
};

const getAdminPages = async (adminType, adminAccessIds) => {
  let query = "SELECT * FROM admin_pages WHERE status='Active'";
  
  if (adminType == 1) {
    // Admin Type 1: Fetch All
    query += " ORDER BY admin_main_menu";
  } else if (adminType == 2 && adminAccessIds && adminAccessIds.length > 0) {
    // Admin Type 2: Fetch specific IDs
    // Note: Since adminAccessIds is a comma-separated string from DB (e.g. "1, 5, 9"), 
    // we inject it directly. This mimics PHP logic. 
    query += ` AND id IN (${adminAccessIds}) ORDER BY admin_main_menu`;
  } else {
    // No access
    return [];
  }

  const [rows] = await pool.execute(query);
  return rows;
};

const getInternalPages = async (mainPageIds) => {
  if (!mainPageIds || mainPageIds.length === 0) return [];
  
  // mainPageIds is an array of numbers [1, 2, 3]
  // We convert it to a string for the IN clause
  const idsString = mainPageIds.join(',');
  
  const query = `SELECT * FROM admin_internalpages WHERE main_page_id IN (${idsString})`;
  const [rows] = await pool.execute(query);
  return rows;
};

module.exports = {
  getEmployeeByCode,
  getAdminPages,
  getInternalPages
};