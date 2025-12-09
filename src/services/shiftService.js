const { pool } = require("../config/database");

const getAllShiftTimings = async () => {
  try {
    const query = "SELECT * FROM employee_shift_timing";
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllShiftTimings
};