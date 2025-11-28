const { pool } = require("../config/database");

const getAllAnnouncements = async () => {
  try {
    const query = "SELECT * FROM announcement";
    // executing the query
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllAnnouncements,
};