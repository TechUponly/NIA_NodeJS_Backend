const { pool } = require("../config/database");

const getAttendanceReport = async (empCode, date) => {
  try {
    const empSql =
      "SELECT emp_id, company_name, department, is_saturday_working, shift_timing, ns FROM employee WHERE emp_code = ?";
    const [empRows] = await pool.execute(empSql, [empCode]);

    if (empRows.length === 0) return [];

    const employee = empRows[0];
    const internalEmpId = employee.emp_id;
    const userCodeForHistory = empCode;

    // Variables from DB
    const isSaturdayWorking = (employee.is_saturday_working || "").trim().toUpperCase();
    const empShiftId = employee.shift_timing;
    const nsStatus = (employee.ns || "").trim();

    // Default Shift
    let shiftStartTime = "10:00:00";
    let shiftWorkingHours = "09:00:00";

    // 2. Fetch Shift Timing
    if (empShiftId) {
      const shiftSql = "SELECT start_time, working_hour FROM employee_shift_timing WHERE id = ?";
      const [shiftRows] = await pool.execute(shiftSql, [empShiftId]);

      if (shiftRows.length > 0) {
        shiftStartTime = shiftRows[0].start_time;
        const whRaw = shiftRows[0].working_hour;
        // Convert to HH:00:00 format
        shiftWorkingHours = `${String(whRaw).padStart(2, '0')}:00:00`;
      }
    }

    // 3. Date & Logic Setup
    // PHP Logic for variables:
    // $is_saturday_working == 'YES' -> $saturday_working = " ", $show_check_in_out = " WHEN (DAYOFWEEK(selected_date) = 1) OR "
    // ELSE -> $saturday_working = "WHEN (DAYOFWEEK(selected_date) = 7) THEN 'Mandate Leave' ", $show_check_in_out = " WHEN (DAYOFWEEK(selected_date) = 1 OR DAYOFWEEK(selected_date) = 7) OR "

    let saturdayWorkingClause = "";
    let showCheckInOutClause = "";

    if (isSaturdayWorking === 'YES') {
      saturdayWorkingClause = " ";
      showCheckInOutClause = " WHEN (DAYOFWEEK(selected_date) = 1) OR ";
    } else {
      saturdayWorkingClause = " WHEN (DAYOFWEEK(selected_date) = 7) THEN 'Mandate Leave' ";
      showCheckInOutClause = " WHEN (DAYOFWEEK(selected_date) = 1 OR DAYOFWEEK(selected_date) = 7) OR ";
    }

    // Date Strings for NP (Next Payroll) Calculations
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');


    let pm = dateObj.getMonth();
    let py = year;
    if (pm === 0) {
      pm = 12;
      py = year - 1;
    }
    const prevMonth = String(pm).padStart(2, '0');

    const NP_month_end = `${year}-${month}-23`;
    const NP_month_start = `${py}-${prevMonth}-23`;
    const NP_apply_month_end = `${year}-${month}-22`;

    // 4. BIG SQL Query
    // We strictly follow the PHP field order and logic
    const sql = `
SELECT DATE_FORMAT(selected_date, '%d-%m-%Y')  AS daydate,
       DAYNAME(selected_date) AS dayname,
       (SELECT IFNULL(attend_id, '0') FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attend_id,
       (SELECT post FROM employee WHERE emp_id=?) AS post,

       (SELECT CASE
        WHEN (SELECT ns FROM employee WHERE emp_id = ?) = '' THEN 'No'
        ELSE (SELECT ns FROM employee WHERE emp_id = ?)
        END) AS ns,

       (SELECT attenddate FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attenddate,
       (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS attendtime,
       (SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS logout_time,

    CASE 
        -- Has valid logout time: logout_time - login_time
        WHEN (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) IS NOT NULL 
             AND (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) != '00:00:00'
             AND (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) != ''
        THEN 
            CONCAT( ROUND( TIME_TO_SEC( TIMEDIFF( 
                (SELECT logout_time FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1),
                (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1)
            ) ) / 3600, 1 ), ' Hr' )
        
        -- No logout time BUT it's today: current IST time - login_time
        WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) IS NOT NULL
             AND (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) != '00:00:00'
             AND (SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1) != ''
             AND selected_date = CURDATE()
        THEN 
            CONCAT( ROUND( 
                (TIME_TO_SEC(TIME(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'))) - 
                 TIME_TO_SEC((SELECT attendtime FROM dailyattendace WHERE attenddate = selected_date AND emp_id = ? ORDER BY attend_id LIMIT 1))) / 3600.0
            , 1 ), ' Hr' )
        
        -- No data OR previous date without logout
        ELSE '0.0 Hr'
    END AS total_working_hour,

       (SELECT location FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS location,
       (SELECT CASE WHEN da_shift_timing='00:00:00' THEN '${shiftStartTime}' ELSE TIME_FORMAT(da_shift_timing,'%H:%i') END FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) AS shift_timing,

       CASE
         WHEN selected_date > CURDATE() THEN
            CASE
                    WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN (SELECT festival FROM holidays WHERE festdate = selected_date)
                    ${saturdayWorkingClause}
                    WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'
                    ELSE 'None'
            END

           ${saturdayWorkingClause}

           WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'

           WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL Then (SELECT festival FROM holidays WHERE festdate = selected_date)

           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = ''
           THEN 'Absent'
           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = 'Approved'
           THEN 'Present'
           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = 'Cancelled'
           THEN CASE
                   WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) IS NULL
                   THEN 'Absent'
                   WHEN TIME((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) = '00:00:00'
                   THEN 'Half Day'
                   WHEN TIME((SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > TIME('${shiftStartTime}')
                   THEN 'Half Day'
                   WHEN TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                                 (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Half Day'
                   ELSE 'Present'
               END

           WHEN (SELECT ns FROM employee WHERE emp_id=?) = ''
           THEN CASE
                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >= 1
                        OR (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 30 )
                     and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) = 0
                        AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 30 )
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >= 1
                        AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 30 )
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) = 0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Half Day'

                   WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) < 1
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Absent'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >=1
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Present'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) =0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Absent'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) =0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Absent'

                   ELSE 'Absent'
               END

           ELSE CASE
                   WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) IS NULL
                   THEN 'Absent'
                   WHEN TIME((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) = '00:00:00'
                   THEN 'Half Day'
                   WHEN TIME((SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > TIME('${shiftStartTime}')
                   THEN 'Half Day'
                   WHEN TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                                 (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Half Day'
                   ELSE 'Present'
               END
       END AS day_status,

        (SELECT case when l_status = '' Then concat(ltype,' Applied')
        WHEN l_status = 'Approved' THEN concat(ltype , ' Approved')
        WHEN l_status = 'Cancelled' THEN concat(ltype, ' Cancelled') ELSE 'NA' END
        FROM leave_app WHERE emp_id=? && selected_date between fdate and tdate order by leave_id  desc limit 1) as Leave_details,

(SELECT admincomment as col FROM leave_app WHERE emp_id=?  && selected_date between fdate and tdate order by leave_id desc limit 1) as admincomment,
(SELECT case when approved_date BETWEEN '${NP_month_start}' and '${NP_month_end}'  THEN NULL ELSE 'Next Payroll' END  as col FROM leave_app WHERE emp_id=? && l_status = 'Approved' && selected_date between fdate and tdate && fdate BETWEEN '${NP_month_start}' and '${NP_apply_month_end}' order by leave_id desc limit 1) as NP_status,
(SELECT count(lead_id) as col FROM leads WHERE emp_id=? && status='ownlead' && leaddate = selected_date) as freshmeeting,
(SELECT count(data_id) from history where emp_id=? and call_duration >5 and data_date=selected_date) as connected_calls,

'00:00:00' as total_break_timing,

 CASE
         WHEN selected_date > CURDATE() THEN
            CASE
                    WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN (SELECT festival FROM holidays WHERE festdate = selected_date)
                    ${saturdayWorkingClause}
                    WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'
                    ELSE 'None'
            END

           ${saturdayWorkingClause}

           WHEN DAYOFWEEK(selected_date) = 1 THEN 'Holiday'

           WHEN (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL Then (SELECT festival FROM holidays WHERE festdate = selected_date)

           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = ''
           THEN 'Leave Applied Hence Absent'
           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = 'Approved'
           THEN 'Leave Approved Hence Present'
           WHEN (SELECT l_status FROM leave_app WHERE emp_id=? AND selected_date BETWEEN fdate AND tdate ORDER BY leave_id DESC LIMIT 1) = 'Cancelled'
           THEN CASE
                   WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) IS NULL
                   THEN 'IN/OUT Missing'
                   WHEN TIME((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) = '00:00:00'
                   THEN 'Logout Missing'
                   WHEN TIME((SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > TIME('${shiftStartTime}')
                   THEN 'Half Day'
                   WHEN TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                                 (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Working Time is Less'
                   ELSE 'Present'
               END

           WHEN (SELECT ns FROM employee WHERE emp_id=?) = ''
           THEN CASE
                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >= 1
                        OR (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 30 )
                     and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) = 0
                        AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 30 )
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN ((SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >= 1
                        AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 30 )
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'Present'

                   WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) = 0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) >= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'F2F or CC are Less'

                   WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) < 1
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'F2F or CC are Less'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) >=1
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'In/Out Missing'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) =0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'F2F or CC are Less or In/Out Missing'

                    WHEN (SELECT COUNT(lead_id) FROM leads WHERE emp_id=? AND status='ownlead' AND leaddate=selected_date) =0
                    AND (SELECT COUNT(data_id) FROM history WHERE emp_id=? AND call_duration > 5 AND data_date=selected_date) <= 15
                    and  TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                    (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > '${shiftWorkingHours}'
                   THEN 'F2F or CC are Less'

                   ELSE 'Absent'
               END

           ELSE CASE
                   WHEN (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1) IS NULL
                   THEN 'Absent'
                   WHEN TIME((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) = '00:00:00'
                   THEN 'Half Day'
                   WHEN TIME((SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) > TIME('${shiftStartTime}')
                   THEN 'Login after ${shiftStartTime}'
                   WHEN TIMEDIFF((SELECT logout_time FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1),
                                 (SELECT attendtime FROM dailyattendace WHERE attenddate=selected_date AND emp_id=? ORDER BY attend_id LIMIT 1)) < '${shiftWorkingHours}'
                   THEN 'Working Time is Less'
                   ELSE 'Present'
               END
       END as Reason,

  CASE
           WHEN (DAYOFWEEK(selected_date) = 1)
                OR ((DAYOFWEEK(selected_date) = 7 AND (DAYOFMONTH(selected_date) <= 7 OR (DAYOFMONTH(selected_date) BETWEEN 15 AND 21))))
                OR (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN 'False'
           WHEN (SELECT IFNULL(da_shift_timing, '00:00:00')
                 FROM dailyattendace
                 WHERE attenddate=selected_date AND emp_id=?
                 ORDER BY attend_id LIMIT 1) IN ('00:00:00', '${shiftStartTime}') THEN 'False'  ELSE 'True'  END AS show_shift_time,

  CASE
           WHEN selected_date > CURDATE() THEN 'False'
           ${showCheckInOutClause} (SELECT festival FROM holidays WHERE festdate = selected_date) IS NOT NULL THEN 'False'
           ELSE 'True'  END AS show_check_inout,

case WHEN (SELECT ns FROM employee WHERE emp_id=?)='Yes' THEN 'False' ELSE 'True' END as 'show_f2f_meeting',
case WHEN (SELECT ns FROM employee WHERE emp_id=?)='Yes' THEN 'False' ELSE 'True' END as 'show_connected_calls',
'False' as 'show_break_timing',
'True' as 'show_reason'

from
(select adddate('1970-01-01',t4.i*10000 + t3.i*1000 + t2.i*100 + t1.i*10 + t0.i) selected_date from
 (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t0,
 (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t1,
 (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t2,
 (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t3,
 (select 0 i union select 1 union select 2 union select 3 union select 4 union select 5 union select 6 union select 7 union select 8 union select 9) t4) v
where selected_date >= LAST_DAY(?) + INTERVAL 1 DAY - INTERVAL 1 MONTH
and selected_date < LAST_DAY(?) + INTERVAL 1 DAY
order by selected_date asc`;

    const params = [
      internalEmpId, // attend_id
      internalEmpId, // post
      internalEmpId, // ns subquery 1
      internalEmpId, // ns subquery 2
      internalEmpId, // attenddate
      internalEmpId, // attendtime
      internalEmpId, // logout_time

      // Total Working Hour Logic
      internalEmpId, internalEmpId, internalEmpId, // Case 1 checks
      internalEmpId, internalEmpId, // Case 1 calc
      internalEmpId, internalEmpId, internalEmpId, // Case 2 checks
      internalEmpId, // Case 2 calc

      internalEmpId, // location
      internalEmpId, // shift_timing

      // Day Status Logic - Leave App
      internalEmpId, // l_status check 1
      internalEmpId, // l_status check 2
      internalEmpId, // l_status check 3

      // Cancelled Logic
      internalEmpId, // attendtime missing
      internalEmpId, // logout missing
      internalEmpId, // half day time check
      internalEmpId, internalEmpId, // working time check (logout, attendtime)

      // NS Check & Complex Block 1
      internalEmpId, // NS check
      internalEmpId, userCodeForHistory, // Case 1: leads>=1 OR calls>=30
      internalEmpId, internalEmpId, // Case 1: working time check

      internalEmpId, userCodeForHistory, // Case 2: leads=0 AND calls>=30
      internalEmpId, internalEmpId, // Case 2: working time check

      internalEmpId, userCodeForHistory, // Case 3: leads>=1 AND calls<=30
      internalEmpId, internalEmpId, // Case 3: working time check

      internalEmpId, userCodeForHistory, // Case 4: leads=0 AND calls>=15
      internalEmpId, internalEmpId, // Case 4: working time check

      internalEmpId, userCodeForHistory, // Case 5: leads<1 AND calls<=15
      internalEmpId, internalEmpId, // Case 5: working time check 

      internalEmpId, userCodeForHistory, // Case 6: leads>=1 AND calls<=15
      internalEmpId, internalEmpId, // Case 6: working time check

      internalEmpId, userCodeForHistory, // Case 7: leads=0 AND calls<=15 (Short)
      internalEmpId, internalEmpId, // Case 7: working time check

      internalEmpId, userCodeForHistory, // Case 8: leads=0 AND calls<=15 (Long)
      internalEmpId, internalEmpId, // Case 8: working time check

      // ELSE Block (NS != '')
      internalEmpId, // attendtime null
      internalEmpId, // logout 00:00:00
      internalEmpId, // late login
      internalEmpId, internalEmpId, // working time check

      // Leave Details & Comments
      internalEmpId, // Leave_details
      internalEmpId, // admincomment
      internalEmpId, // NP_status

      // Counts
      internalEmpId, // freshmeeting
      userCodeForHistory, // connected_calls

      // REASON Logic (Identical structure to day_status mostly)
      // Leave App
      internalEmpId, // l_status check 1
      internalEmpId, // l_status check 2
      internalEmpId, // l_status check 3

      // Cancelled Logic
      internalEmpId, // attendtime missing
      internalEmpId, // logout missing
      internalEmpId, // half day time check
      internalEmpId, internalEmpId, // working time check

      // NS Check & Complex Block 2
      internalEmpId, // NS check
      internalEmpId, userCodeForHistory, // Case 1
      internalEmpId, internalEmpId, // Case 1 time

      internalEmpId, userCodeForHistory, // Case 2
      internalEmpId, internalEmpId, // Case 2 time

      internalEmpId, userCodeForHistory, // Case 3
      internalEmpId, internalEmpId, // Case 3 time

      internalEmpId, userCodeForHistory, // Case 4
      internalEmpId, internalEmpId, // Case 4 time

      internalEmpId, userCodeForHistory, // Case 5
      internalEmpId, internalEmpId, // Case 5 time

      internalEmpId, userCodeForHistory, // Case 6
      internalEmpId, internalEmpId, // Case 6 time

      internalEmpId, userCodeForHistory, // Case 7
      internalEmpId, internalEmpId, // Case 7 time

      internalEmpId, userCodeForHistory, // Case 8
      internalEmpId, internalEmpId, // Case 8 time

      // ELSE Block (NS != '') REASON
      internalEmpId, // attendtime null
      internalEmpId, // logout 00:00:00
      internalEmpId, // late login
      internalEmpId, internalEmpId, // working time check

      // Show Shift Time
      internalEmpId,

      // Show Check In/Out (No params, just injected string logic)

      // Extras
      internalEmpId, // show_f2f
      internalEmpId, // show_connected

      date, // LAST_DAY param 1
      date  // LAST_DAY param 2
    ];

    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} - Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

/**
 * Check if user's GPS coordinates are within any office location bounds
 * Matches user lat/lng against Latitude1, Latitude2, Longitude1, Longitude2 from office_location table
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @returns {Object} - { isWithinBounds: boolean, locationName: string|null, officeLat: object|null, officeLng: object|null }
 */
const checkOfficeLocationBounds = async (userLat, userLng) => {
  try {
    const locationSql = `
      SELECT Latitude1, Latitude2, Longitude1, Longitude2, location_name 
      FROM office_location
    `;

    const [locations] = await pool.execute(locationSql);

    if (locations.length === 0) {
      // No office locations defined, allow attendance
      return { isWithinBounds: true, locationName: null, officeCoords: null };
    }

    for (const loc of locations) {
      const lat1 = parseFloat(loc.Latitude1);
      const lat2 = parseFloat(loc.Latitude2);
      const lng1 = parseFloat(loc.Longitude1);
      const lng2 = parseFloat(loc.Longitude2);

      // Determine min/max for latitude and longitude
      const minLat = Math.min(lat1, lat2);
      const maxLat = Math.max(lat1, lat2);
      const minLng = Math.min(lng1, lng2);
      const maxLng = Math.max(lng1, lng2);

      // Check if user coordinates fall within the bounding box
      if (userLat >= minLat && userLat <= maxLat &&
        userLng >= minLng && userLng <= maxLng) {
        return {
          isWithinBounds: true,
          locationName: loc.location_name,
          officeCoords: {
            latitude1: lat1,
            latitude2: lat2,
            longitude1: lng1,
            longitude2: lng2
          }
        };
      }
    }

    // Return the first office location bounds for reference
    const firstLoc = locations[0];
    return {
      isWithinBounds: false,
      locationName: firstLoc.location_name,
      officeCoords: {
        latitude1: parseFloat(firstLoc.Latitude1),
        latitude2: parseFloat(firstLoc.Latitude2),
        longitude1: parseFloat(firstLoc.Longitude1),
        longitude2: parseFloat(firstLoc.Longitude2)
      }
    };
  } catch (error) {
    console.error("Error checking office location bounds:", error);
    throw error;
  }
};

/**
 * Mark attendance for an employee
 * Replicates the PHP attendance_mark.php logic
 */
const markAttendance = async (empCode, attenddate, attendtime, location, latitude = null, longitude = null) => {
  try {
    // Step 1: Get employee details, shift time, and mobile_app_level
    const empSql = `
      SELECT 
        emp_id, 
        usercode, 
        mobile_app_level,
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
    const { emp_id, usercode, shifttime, mobile_app_level } = employee;

    // Check if usercode exists (similar to PHP's if ($usercode!=''))
    if (!usercode || usercode === '') {
      return {
        success: false,
        message: ''
      };
    }

    // Track coordinates used for response
    let usedLatitude = null;
    let usedLongitude = null;
    let officeName = null;

    // Always try to extract coordinates from location string or separate params
    let userLat = latitude ? parseFloat(latitude) : null;
    let userLng = longitude ? parseFloat(longitude) : null;

    // If latitude/longitude not provided separately, try to extract from location string
    // Location format: "19.082493349058748,73.01471276117357"
    if ((userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) && location) {
      const coordPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
      const match = location.match(coordPattern);

      if (match) {
        const extractedLat = parseFloat(match[1]);
        const extractedLng = parseFloat(match[2]);

        // Validate extracted coordinates are in valid range
        if (!isNaN(extractedLat) && !isNaN(extractedLng) &&
          extractedLat >= -90 && extractedLat <= 90 &&
          extractedLng >= -180 && extractedLng <= 180) {
          userLat = extractedLat;
          userLng = extractedLng;
        }
      }
    }

    // Store the coordinates used
    usedLatitude = userLat;
    usedLongitude = userLng;

    // Step 2: Check mobile_app_level for location verification
    // mobile_app_level = 3 means "Team and 10 AM Login" - requires office location verification
    if (mobile_app_level === '3' | mobile_app_level === 3 || mobile_app_level === '2' | mobile_app_level === 2) {
      // Coordinates are REQUIRED for mobile_app_level 3
      if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
        return {
          success: false,
          message: "Location coordinates are required for attendance. Please enable GPS.",
          latitude_used: null,
          longitude_used: null,
          office_name: null,
          office_coords: null
        };
      }

      // Check if user is within office location bounds (Latitude1-Latitude2, Longitude1-Longitude2)
      const locationCheck = await checkOfficeLocationBounds(userLat, userLng);
      officeName = locationCheck.locationName;

      if (!locationCheck.isWithinBounds) {
        return {
          success: false,
          message: `Out of location - Your coordinates do not match office location bounds.`,
          latitude_used: usedLatitude,
          longitude_used: usedLongitude,
          office_name: locationCheck.locationName,
          office_coords: locationCheck.officeCoords
        };
      }
    }

    // Step 3: Check if attendance already marked for today
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
        message: "Already Attendance is Marked,Please check in Attendance View",
        latitude_used: usedLatitude,
        longitude_used: usedLongitude,
        office_name: officeName
      };
    }

    // Step 4: Insert new attendance record
    // Use CONVERT_TZ to convert server time to Indian Standard Time (IST, UTC+05:30)
    // Store the office name in location field if matched, otherwise use original location
    const locationToStore = officeName || location;

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

    await pool.execute(insertSql, [locationToStore, emp_id, shifttime]);

    return {
      success: true,
      message: "Attendance Mark Successfully",
      latitude_used: usedLatitude,
      longitude_used: usedLongitude,
      office_name: officeName
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
const markLogout = async (attend_id, logout_location, empCode, latitude = null, longitude = null) => {
  try {
    let targetAttendId = attend_id;
    let mobile_app_level = null;
    let emp_id = null;

    // Logic to determine targetAttendId and mobile_app_level
    if (empCode) {
      // Get emp_id and mobile_app_level from emp_code
      const [empRows] = await pool.execute("SELECT emp_id, mobile_app_level FROM employee WHERE emp_code = ?", [empCode]);

      if (empRows.length === 0) {
        return { success: false, message: "Employee not found" };
      }

      emp_id = empRows[0].emp_id;
      mobile_app_level = empRows[0].mobile_app_level;

      if (!targetAttendId) {
        // Get today's attendance record
        const [attendRows] = await pool.execute(
          `SELECT attend_id FROM dailyattendace 
           WHERE emp_id = ? 
           AND attenddate = DATE_FORMAT(NOW(), '%Y-%m-%d') 
           ORDER BY attend_id DESC LIMIT 1`,
          [emp_id]
        );

        if (attendRows.length === 0) {
          return { success: false, message: "No attendance record found for today" };
        }
        targetAttendId = attendRows[0].attend_id;
      }
    } else if (targetAttendId) {
      // We have attend_id, need to fetch mobile_app_level
      // First get emp_id from dailyattendace
      const [attendRows] = await pool.execute("SELECT emp_id FROM dailyattendace WHERE attend_id = ?", [targetAttendId]);

      if (attendRows.length > 0) {
        emp_id = attendRows[0].emp_id;
        // Now get mobile_app_level
        const [empRows] = await pool.execute("SELECT mobile_app_level FROM employee WHERE emp_id = ?", [emp_id]);
        if (empRows.length > 0) {
          mobile_app_level = empRows[0].mobile_app_level;
        }
      }
    }

    if (!targetAttendId) {
      return { success: false, message: "Invalid Request: Missing Attendance ID" };
    }

    // --- LOCATION VERIFICATION LOGIC (Same as markAttendance) ---

    // Track coordinates used for response
    let usedLatitude = null;
    let usedLongitude = null;
    let officeName = null;

    // Always try to extract coordinates from location string or separate params
    let userLat = latitude ? parseFloat(latitude) : null;
    let userLng = longitude ? parseFloat(longitude) : null;

    // If latitude/longitude not provided separately, try to extract from logout_location string
    if ((userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) && logout_location) {
      const coordPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
      const match = logout_location.match(coordPattern);

      if (match) {
        const extractedLat = parseFloat(match[1]);
        const extractedLng = parseFloat(match[2]);

        if (!isNaN(extractedLat) && !isNaN(extractedLng) &&
          extractedLat >= -90 && extractedLat <= 90 &&
          extractedLng >= -180 && extractedLng <= 180) {
          userLat = extractedLat;
          userLng = extractedLng;
        }
      }
    }

    usedLatitude = userLat;
    usedLongitude = userLng;

    // Check mobile_app_level for location verification (Levels 2 and 3)
    if (mobile_app_level === '3' || mobile_app_level === 3 || mobile_app_level === '2' || mobile_app_level === 2) {
      // Coordinates are REQUIRED
      if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
        return {
          success: false,
          message: "Location coordinates are required for logout. Please enable GPS.",
          latitude_used: null,
          longitude_used: null,
          office_name: null,
          office_coords: null
        };
      }

      // Check against office boundaries
      const locationCheck = await checkOfficeLocationBounds(userLat, userLng);
      officeName = locationCheck.locationName;

      if (!locationCheck.isWithinBounds) {
        return {
          success: false,
          message: `Out of location - Your coordinates do not match office location bounds.`,
          latitude_used: usedLatitude,
          longitude_used: usedLongitude,
          office_name: locationCheck.locationName,
          office_coords: locationCheck.officeCoords
        };
      }
    }
    // --- END LOCATION VERIFICATION LOGIC ---

    const locationToStore = officeName || logout_location;

    // Use CONVERT_TZ to convert server time to Indian Standard Time (IST, UTC+05:30) in 24-hour format
    const sql = `Update dailyattendace set logout_time=DATE_FORMAT(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'),'%H:%i:%s'),logout_location=? where attend_id=?`;

    const [result] = await pool.execute(sql, [locationToStore, targetAttendId]);

    return {
      success: true,
      message: "Your Out Time Updated Successfully",
      latitude_used: usedLatitude,
      longitude_used: usedLongitude,
      office_name: officeName,
      office_coords: null // If successful, coords matched, usually we don't return bounds in success but API consistency might require it or null is fine.
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
