const { pool } = require("../config/database");

const getOfficeLocations = async () => {
  try {
    const query = "SELECT DISTINCT city, branch_code FROM location";
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getOfficeLocations
};