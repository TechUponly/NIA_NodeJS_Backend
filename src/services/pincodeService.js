const { pool } = require("../config/database");

const getCityStateByPincode = async (pincode) => {
  try {
    const query = "SELECT city, state FROM pincode_new WHERE pincode = ? ORDER BY city ASC";
    const [rows] = await pool.execute(query, [pincode]);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getCityStateByPincode
};