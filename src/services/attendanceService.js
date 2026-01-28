const { pool } = require("../config/database");

const getAttendanceReport = async (empCode, date) => {
  try {
    // 1. Fetch Employee Shift & Details
    const empSql =
      "SELECT emp_id, company_name, department, is_saturday_working, shift_timing FROM employee WHERE emp_code = ?";
    const [empRows] = await pool.execute(empSql, [empCode]);

    if (empRows.length === 0) return [];

    const employee = empRows[0];
    const isSaturdayWorking = (employee.is_saturday_working || "")
      .trim()
      .toUpperCase();
    const empShiftId = employee.shift_timing;

    // Default Shift
    let shiftStartTime = "10:00:00";
    let shiftWorkingHours = "09:00:00"; // Default 9 hours

    // 2. Fetch Shift Timing
    if (empShiftId) {
      const shiftSql =
        "SELECT start_time, working_hour FROM employee_shift_timing WHERE id = ?";
      const [shiftRows] = await pool.execute(shiftSql, [empShiftId]);

      if (shiftRows.length > 0) {
        shiftStartTime = shiftRows[0].start_time;
        // Ensure format is HH:MM:SS (e.g. 9 -> 09:00:00)
        const hours = String(shiftRows[0].working_hour).padStart(2, "0");
        shiftWorkingHours = `${hours}:00:00`;
      }
    }

    // 3. Prepare Logic Strings
    let saturdayLogic = "";
    if (isSaturdayWorking === "YES") {
      saturdayLogic = " ";
    } else {
      saturdayLogic =
        " WHEN (DAYOFWEEK(selected_date) = 7) THEN 'Mandate Leave' ";
    }

    // 4. Main Query
    // Added 'ORDER BY selected_date ASC' at the very end
    const sql = `
      SELECT 
        DATE_FORMAT(selected_date, '%d-%m-%Y') AS daydate,
        DAYNAME(selected_date) AS dayname,
        (SELECT IFNULL(attend_id, '0') FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attend_id,
        (SELECT post FROM employee WHERE emp_id=?) AS post,

        (SELECT CASE WHEN (SELECT ns FROM employee WHERE emp_id = ?) = '' THEN 'No' ELSE (SELECT ns FROM employee WHERE emp_id = ?) END) AS ns,

        (SELECT attenddate FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attenddate,
        (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attendtime,
        (SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS logout_time,

        CASE 
          -- Has valid logout
          WHEN (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) IS NOT NULL 
               AND (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) != '00:00:00'
          THEN 
              CONCAT( ROUND( TIME_TO_SEC( TIMEDIFF( 
                  (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1),
                  (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1)
              ) ) / 3600, 1 ), ' Hr' )
          
          -- No logout but is TODAY (Live Calculation)
          WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) IS NOT NULL
               AND selected_date = CURDATE()
          THEN 
              CONCAT( ROUND( 
                  (TIME_TO_SEC(TIME(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'))) - 
                   TIME_TO_SEC((SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1))) / 3600.0
              , 1 ), ' Hr' )
          
          ELSE '0.0 Hr'
        END AS total_working_hour,

        (SELECT location FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS location,
        (SELECT CASE WHEN da_shift_timing='00:00:00' THEN ? ELSE TIME_FORMAT(da_shift_timing,'%H:%i') END FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS shift_timing,

        -- STATUS LOGIC
        CASE
          WHEN selected_date > CURDATE() THEN
             CASE
                 WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN (SELECT festival FROM holidays WHERE festdate = selected_date)
                 ${saturdayLogic}
                 WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'
                 ELSE 'None'
             END

          ${saturdayLogic}

          WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'
          WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL Then (SELECT festival FROM holidays WHERE festdate = selected_date)

          -- Leave Logic
          WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = '' THEN 'Absent'
          WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = 'Approved' THEN 'Present'
          
          -- Default Absent
          ELSE 'Absent' 
        END AS day_status,
        
        -- Extra Fields for Frontend Logic (Show/Hide)
        (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) as leave_status_check,
        
        -- Logic for showing shift time (Boolean check in SQL)
        CASE 
          WHEN (DAYOFWEEK(selected_date) = 1) 
               OR ((DAYOFWEEK(selected_date) = 7 AND (DAY(selected_date) <= 7 OR (DAY(selected_date) BETWEEN 15 AND 21))))
               OR (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL 
          THEN 'False'
          WHEN (SELECT IFNULL(da_shift_timing, '00:00:00') FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) IN ('00:00:00', ?) 
          THEN 'False' 
          ELSE 'True' 
        END AS show_shift_time,

        CASE 
           WHEN selected_date > CURDATE() THEN 'False'
           WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN 'False'
           ELSE 'True' 
        END AS show_check_inout,

        CASE WHEN (SELECT ns FROM employee WHERE emp_id=?)='Yes' THEN 'False' ELSE 'True' END as show_f2f_meeting,
        CASE WHEN (SELECT ns FROM employee WHERE emp_id=?)='Yes' THEN 'False' ELSE 'True' END as show_connected_calls,
        'False' as show_break_timing,
        'True' as show_reason

      FROM
      (
        select adddate('1970-01-01',t4.i*10000 + t3.i*1000 + t2.i*100 + t1.i*10 + t0.i) selected_date from
         (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t0,
         (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t1,
         (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t2,
         (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t3,
         (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t4
      ) v
      WHERE selected_date >= LAST_DAY(?) + INTERVAL 1 DAY - INTERVAL 1 MONTH
      AND selected_date < LAST_DAY(?) + INTERVAL 1 DAY
      
      ORDER BY selected_date ASC
    `;

    const params = [
      employee.emp_id, // 1
      employee.emp_id, // 2
      employee.emp_id, // 3
      employee.emp_id, // 4
      employee.emp_id, // 5
      employee.emp_id, // 6
      employee.emp_id, // 7
      employee.emp_id, // 8
      employee.emp_id, // 9
      employee.emp_id, // 10
      employee.emp_id, // 11
      employee.emp_id, // 12
      employee.emp_id, // 13
      employee.emp_id, // 14
      shiftStartTime, // 15
      employee.emp_id, // 16
      employee.emp_id, // 17 (leave check 1)
      employee.emp_id, // 18 (leave check 2)

      employee.emp_id, // 19 (leave status check for extra field)
      employee.emp_id, // 20 (shift time check)
      shiftStartTime, // 21 (shift time check)

      employee.emp_id, // 22 (ns check 1)
      employee.emp_id, // 23 (ns check 2)

      date, // 24 (Date Range Start)
      date, // 25 (Date Range End)
    ];

    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Mark attendance for an employee
 * Replicates the PHP attendance_mark.php logic
 */
const markAttendance = async (empCode, attenddate, attendtime, location) => {
  try {
    // Step 1: Get employee details and shift time
    const empSql = `
      SELECT 
        emp_id, 
        usercode, 
        getshifttime(emp_id) as shifttime 
      FROM employee 
      WHERE emp_code = ?
    `;

    const [empRows] = await pool.execute(empSql, [empCode]);

    if (empRows.length === 0) {
      return {
        success: false,
        message: "Employee not found"
      };
    }

    const employee = empRows[0];
    const { emp_id, usercode, shifttime } = employee;

    // Check if usercode exists (similar to PHP's if ($usercode!=''))
    if (!usercode || usercode === '') {
      return {
        success: false,
        message: ''
      };
    }

    // Step 2: Check if attendance already marked for today
    const checkSql = `
      SELECT COUNT(*) as col 
      FROM dailyattendace 
      WHERE emp_id = ? 
      AND attenddate = DATE_FORMAT(NOW(), '%Y-%m-%d')
    `;

    const [checkRows] = await pool.execute(checkSql, [emp_id]);
    const attendCount = checkRows[0].col;

    if (attendCount > 0) {
      return {
        success: false,
        message: "Already Attendance is Marked,Please check in Attendance View"
      };
    }

    // Step 3: Insert new attendance record
    // Use CONVERT_TZ to convert server time to Indian Standard Time (IST, UTC+05:30)
    const insertSql = `
      INSERT INTO dailyattendace(attenddate, attendtime, location, emp_id, da_shift_timing, logout_time, logout_location)
      VALUES (
        DATE_FORMAT(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'), '%Y-%m-%d'),
        DATE_FORMAT(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'), '%H:%i:%s'),
        ?,
        ?,
        ?,
        '00:00:00',
        ''
      )
    `;

    await pool.execute(insertSql, [location, emp_id, shifttime]);

    return {
      success: true,
      message: "Attendance Mark Successfully"
    };

  } catch (error) {
    console.error("Error in markAttendance:", error);
    throw error;
  }
};

/**
 * Mark logout for an employee
 * Replicates the PHP logout.php logic
 */
const markLogout = async (attend_id, logout_location, empCode) => {
  try {
    let targetAttendId = attend_id;

    // If attend_id is missing but we have empCode -> Look it up
    if (!targetAttendId && empCode) {
      // 1. Get internal emp_id from emp_code
      const [empRows] = await pool.execute("SELECT emp_id FROM employee WHERE emp_code = ?", [empCode]);

      if (empRows.length === 0) {
        return { success: false, message: "Employee not found" };
      }

      const internalEmpId = empRows[0].emp_id;

      // 2. Get today's attendance record
      // We look for the latest record for today.
      const [attendRows] = await pool.execute(
        `SELECT attend_id FROM dailyattendace 
         WHERE emp_id = ? 
         AND attenddate = DATE_FORMAT(NOW(), '%Y-%m-%d') 
         ORDER BY attend_id DESC LIMIT 1`,
        [internalEmpId]
      );

      if (attendRows.length === 0) {
        return { success: false, message: "No attendance record found for today" };
      }

      targetAttendId = attendRows[0].attend_id;
    }

    if (!targetAttendId) {
      return { success: false, message: "Invalid Request: Missing Attendance ID" };
    }

    // Use CONVERT_TZ to convert server time to Indian Standard Time (IST, UTC+05:30) in 24-hour format
    const sql = `Update dailyattendace set logout_time=DATE_FORMAT(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'),'%H:%i:%s'),logout_location=? where attend_id=?`;

    const [result] = await pool.execute(sql, [logout_location, targetAttendId]);

    return {
      success: true,
      message: "Your Out Time Updated Successfully",
    };
  } catch (error) {
    console.error("Error in markLogout:", error);
    throw error;
  }
};

module.exports = {
  getAttendanceReport,
  markAttendance,
  markLogout,
};
