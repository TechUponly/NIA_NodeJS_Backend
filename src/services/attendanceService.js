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
      empCode, // 1
      empCode, // 2
      empCode, // 3
      empCode, // 4
      empCode, // 5
      empCode, // 6
      empCode, // 7
      empCode, // 8
      empCode, // 9
      empCode, // 10
      empCode, // 11
      empCode, // 12
      empCode, // 13
      empCode, // 14
      shiftStartTime, // 15
      empCode, // 16
      empCode, // 17 (leave check 1)
      empCode, // 18 (leave check 2)

      empCode, // 19 (leave status check for extra field)
      empCode, // 20 (shift time check)
      shiftStartTime, // 21 (shift time check)

      empCode, // 22 (ns check 1)
      empCode, // 23 (ns check 2)

      date, // 24 (Date Range Start)
      date, // 25 (Date Range End)
    ];

    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAttendanceReport,
};
