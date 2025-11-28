const { pool } = require("../config/database");

const getUpcomingHolidays = async () => {
  try {
    const query = `
      SELECT * FROM holidays 
      WHERE festdate >= CURDATE() 
      ORDER BY festdate
    `;
    
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getUpcomingHolidays,
};