const { pool } = require("../config/database");

const getAbscondingDetails = async (empId) => {
  try {
    const query = "SELECT * FROM absconding_letter WHERE empid = ? LIMIT 1";
    const [rows] = await pool.execute(query, [empId]);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAbscondingDetails
};