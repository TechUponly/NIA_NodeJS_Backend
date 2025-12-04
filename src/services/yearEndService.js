const { pool } = require("../config/database");

/**
 * Helper: Check if a year is a leap year (366 days)
 */
const isLeapYear = (year) => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

/**
 * Helper: Calculate difference in days between two dates
 */
const getDaysDiff = (start, end) => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((end - start) / oneDay)) + 1; // +1 to include start date
};

const processYearEnd = async () => {
  const connection = await pool.getConnection();
  const processedLog = [];
  const errors = [];

  try {
    // 1. DATES SETUP
    const currentYear = new Date().getFullYear(); // e.g., 2025
    const processingYear = currentYear - 1;       // e.g., 2024
    
    // PHP: $days_in_year = 365 + date("L")
    const daysInYear = isLeapYear(processingYear) ? 366 : 365;

    const startDateStr = `${processingYear}-01-01`;
    const endDateStr = `${processingYear}-12-31`;

    console.log(`Processing Year End for ${processingYear} -> Opening Balances for ${currentYear}`);

    // 2. FETCH ACTIVE EMPLOYEES
    const [employees] = await connection.execute(
      "SELECT emp_id, joindate FROM employee WHERE active_inactive_status = 'Active'"
    );

    // Loop through each employee
    for (const emp of employees) {
      try {
        const empId = emp.emp_id;
        const joinDate = new Date(emp.joindate);

        // Check Probation Status (Joined Date + 1 Year)
        const probationEndDate = new Date(joinDate);
        probationEndDate.setFullYear(probationEndDate.getFullYear() + 1);
        
        const procYearEnd = new Date(endDateStr);
        const isStillProbation = procYearEnd <= probationEndDate;

        // --- A. GET PREVIOUS BALANCE (Opening of 2024) ---
        const [balRows] = await connection.execute(
          "SELECT * FROM leave_balance WHERE emp_id = ? AND year = ?",
          [empId, processingYear]
        );
        
        const balance = balRows[0] || {};
        const opCl = balance.cl_opening ? parseFloat(balance.cl_opening) : 8;
        const opPl = balance.pl_opening ? parseFloat(balance.pl_opening) : 0;
        const opSl = balance.sl_opening ? parseFloat(balance.sl_opening) : 0;

        // --- B. GET LEAVES TAKEN IN 2024 ---
        const [usedRows] = await connection.execute(
          `SELECT ltype, SUM(no_of_days) as used 
           FROM leave_app 
           WHERE emp_id = ? AND l_status = 'Approved' 
           AND fdate BETWEEN ? AND ? 
           GROUP BY ltype`,
          [empId, startDateStr, endDateStr]
        );

        // Map used leaves
        const used = {
          'Casual Leave': 0,
          'Privilege Leave': 0,
          'Sick Leave': 0,
          'Maternity': 0, // Grouping all maternity
          'LWP': 0        // Grouping LWP/Extraordinary
        };

        usedRows.forEach(row => {
          const type = row.ltype;
          const val = parseFloat(row.used);

          if (used[type] !== undefined) {
            used[type] = val;
          } else if (type.includes('Maternity')) {
            used['Maternity'] += val;
          } else if (type.includes('LWP') || type.includes('Extraordinary')) {
            used['LWP'] += val;
          }
          // Also map specific keys for calculation if needed
          if (type === 'Casual Leave') used['Casual Leave'] = val;
          if (type === 'Privilege Leave') used['Privilege Leave'] = val;
          if (type === 'Sick Leave') used['Sick Leave'] = val;
        });

        // --- C. CALCULATE NEW CREDITS FOR 2025 ---

        // 1. CASUAL LEAVE (CL)
        // Rule: Unused CL becomes LYCL. Fresh CL is 8.
        const clRemaining = opCl - used['Casual Leave'];
        let newLycl = Math.max(clRemaining, 0);
        let newCl = 8;

        let newPl = 0;
        let newSl = 0;

        if (isStillProbation) {
          // PROBATION: No PL/SL/LYCL Credit
          newPl = 0;
          newSl = 0;
          newLycl = 0; // CL Lapses
        } else {
          // CONFIRMED - PRO-RATA CALCULATION

          // Calculate Days Employed
          const calcStart = joinDate > new Date(startDateStr) ? joinDate : new Date(startDateStr);
          const calcEnd = new Date(endDateStr);
          
          let daysEmployed = getDaysDiff(calcStart, calcEnd);
          daysEmployed = Math.max(0, daysEmployed);

          // 2. PRIVILEGE LEAVE (PL)
          // Days on Duty = Total Days - (PL + SL + Mat + LWP)
          const daysAbsent = used['Privilege Leave'] + 
                             used['Sick Leave'] + 
                             used['Maternity'] + 
                             used['LWP'];
          
          const daysOnDuty = daysEmployed - daysAbsent;
          const plEarned = daysOnDuty / 12;

          const plRemaining = opPl - used['Privilege Leave'];
          newPl = plRemaining + plEarned;

          if (newPl > 300) newPl = 300; // Cap

          // 3. SICK LEAVE (SL)
          // Rule: 20 Units * (Days Employed / Days in Year)
          const slCredit = 20 * (daysEmployed / daysInYear);

          // Convert Days Used to Units (1 Day = 2 Units)
          const slUnitsUsed = used['Sick Leave'] * 2;
          
          const slRemaining = opSl - slUnitsUsed;
          newSl = slRemaining + slCredit;

          if (newSl > 480) newSl = 480; // Cap
        }

        // --- D. INSERT/UPDATE DB ---
        // We use ON DUPLICATE KEY UPDATE to handle re-runs safely
        const insertQuery = `
          INSERT INTO leave_balance (emp_id, year, cl_opening, pl_opening, sl_opening, lycl_opening) 
          VALUES (?, ?, ?, ?, ?, ?) 
          ON DUPLICATE KEY UPDATE 
          cl_opening = VALUES(cl_opening), 
          pl_opening = VALUES(pl_opening), 
          sl_opening = VALUES(sl_opening), 
          lycl_opening = VALUES(lycl_opening)
        `;

        await connection.execute(insertQuery, [
          empId, 
          currentYear, 
          newCl, 
          newPl, 
          newSl, 
          newLycl
        ]);

        processedLog.push(empId);

      } catch (empError) {
        console.error(`Error processing employee ${emp.emp_id}:`, empError);
        errors.push({ emp_id: emp.emp_id, error: empError.message });
      }
    } // End Loop

    return { 
      success: true, 
      processed_count: processedLog.length, 
      processed_ids: processedLog,
      errors: errors 
    };

  } catch (error) {
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  processYearEnd
};