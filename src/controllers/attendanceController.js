const attendanceService = require("../services/attendanceService");

const getAttendance = async (req, res) => {
  try {
    const { emp_id, date } = req.query;

    if (!emp_id || !date) {
      return res.status(400).json({ status: 'error', message: 'Missing emp_id or date' });
    }

    const data = await attendanceService.getAttendanceReport(emp_id, date);

    if (data.length > 0) {
      // Logic to convert string "True"/"False" to booleans if needed
      // (Though my SQL above returns strings directly, we map it for frontend compatibility)
      const formattedData = data.map(record => {
        // Example conversion if your SQL returns specific boolean strings
        // For now, passing data as is matches the PHP fetch_all
        return record;
      });

      res.status(200).json({
        status: 'success',
        data: formattedData
      });
    } else {
      res.status(200).json({
        status: 'error',
        message: 'No records found'
      });
    }

  } catch (error) {
    console.error("Error in getAttendance:", error);
    res.status(500).json({ status: 'error', message: "Server Error" });
  }
};

module.exports = {
  getAttendance
};