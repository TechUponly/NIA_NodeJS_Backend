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

/**
 * Mark attendance for an employee
 * Replicates PHP attendance_mark.php with user-agent validation
 */
const markAttendance = async (req, res) => {
  try {
    // User-agent validation (replicate PHP logic)
    const userAgent = req.headers['user-agent'] || '';

    // Block requests from browsers and common API testing tools
    const blockedAgents = ['Mozilla', 'Chrome', 'Safari', 'PostmanRuntime', 'Trident', 'Thunder Client', 'MSIE'];
    const isBlocked = blockedAgents.some(agent => userAgent.includes(agent));

    if (isBlocked) {
      return res.status(403).json({
        message: "Access Denied: Unauthorized Request."
      });
    }

    // Get parameters from query string (matching PHP $_GET)
    const { emp_id, attenddate, attendtime, location } = req.query;

    if (!emp_id || !location) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: emp_id and location'
      });
    }

    // Call service to mark attendance
    const result = await attendanceService.markAttendance(
      emp_id,
      attenddate,
      attendtime,
      location
    );

    // Return response matching PHP format
    return res.status(200).json({
      message: result.message
    });

  } catch (error) {
    console.error("Error in markAttendance:", error);
    res.status(500).json({
      message: "Data Error"
    });
  }
};



/**
 * Mark logout for an employee
 */
const markLogout = async (req, res) => {
  try {
    const attend_id = req.body.attend_id || req.query.attend_id;
    const logout_location = req.body.logout_location || req.query.logout_location;
    const emp_id = req.body.emp_id || req.query.emp_id;

    if (!attend_id && !emp_id) {
      return res.status(200).json({
        message: "Something Went Wrong,Please Try Again",
      });
    }

    const result = await attendanceService.markLogout(attend_id, logout_location, emp_id);

    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    console.error("Error in markLogout:", error);
    res.status(500).json({
      message: "Data Error", // Matching PHP error message slightly
    });
  }
};

module.exports = {
  getAttendance,
  markAttendance,
  markLogout,
};