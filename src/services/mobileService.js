const { pool } = require("../config/database");

const getMobileAppLevels = async () => {
  try {
    const query = "SELECT id, description, status, explanation FROM mobile_app_level";
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getMobileAppLevels
};