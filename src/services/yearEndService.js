const { pool } = require("../config/database");

const getDaysDiff = (start, end) =>
  Math.round(Math.abs((end - start) / (24 * 60 * 60 * 1000))) + 1;
const isLeapYear = (year) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const processYearEnd = async () => {
  const connection = await pool.getConnection();
  const processedLog = [];
  const errors = [];
  const currentYear = new Date().getFullYear();

  try {
    const processingYear = currentYear - 1;
    const daysInYear = isLeapYear(processingYear) ? 366 : 365;
    const startDateStr = `${processingYear}-01-01`;
    const endDateStr = `${processingYear}-12-31`;

    const [employees] = await connection.execute(
      "SELECT emp_id, joindate, employee_type FROM employee WHERE active_inactive_status = 'Active'"
    );

    for (const emp of employees) {
      try {
        const empId = emp.emp_id;
        // UPDATED: fetch employee_type
        const employeeType = emp.employee_type || "Core";
        const joinDate = new Date(emp.joindate);
        const probationEndDate = new Date(joinDate);
        probationEndDate.setFullYear(probationEndDate.getFullYear() + 1);
        const procYearEnd = new Date(endDateStr);
        const isStillProbation = procYearEnd <= probationEndDate;

        const [balRows] = await connection.execute(
          "SELECT * FROM leave_balance WHERE emp_id = ? AND year = ?",
          [empId, processingYear]
        );
        const balance = balRows[0] || {};
        const opCl = balance.cl_opening ? parseFloat(balance.cl_opening) : 8;
        const opPl = balance.pl_opening ? parseFloat(balance.pl_opening) : 0;
        const opSl = balance.sl_opening ? parseFloat(balance.sl_opening) : 0;

        const [usedRows] = await connection.execute(
          `SELECT ltype, SUM(no_of_days) as used FROM leave_app WHERE emp_id = ? AND l_status = 'Approved' AND fdate BETWEEN ? AND ? GROUP BY ltype`,
          [empId, startDateStr, endDateStr]
        );

        const used = {
          "Casual Leave": 0,
          "Privilege Leave": 0,
          "Sick Leave": 0,
          Maternity: 0,
          LWP: 0,
        };
        usedRows.forEach((row) => {
          const val = parseFloat(row.used);
          if (used[row.ltype] !== undefined) used[row.ltype] = val;
          if (row.ltype.includes("Maternity")) used["Maternity"] += val;
          if (row.ltype.includes("LWP") || row.ltype.includes("Extraordinary"))
            used["LWP"] += val;
        });

        const clRemaining = opCl - used["Casual Leave"];
        let newLycl = Math.max(clRemaining, 0);
        let newCl = 8;
        let newPl = 0;
        let newSl = 0;

        // UPDATED: Probation & Contractual Logic
        if (
          !isStillProbation &&
          employeeType !== "Contractual" &&
          employeeType !== "Core Probation"
        ) {
          const calcStart =
            joinDate > new Date(startDateStr)
              ? joinDate
              : new Date(startDateStr);
          let daysEmployed = getDaysDiff(calcStart, new Date(endDateStr));
          daysEmployed = Math.max(0, daysEmployed);

          const daysAbsent =
            used["Privilege Leave"] +
            used["Sick Leave"] +
            used["Maternity"] +
            used["LWP"];
          const daysOnDuty = daysEmployed - daysAbsent;
          const plEarned = daysOnDuty / 12;
          const plRemaining = opPl - used["Privilege Leave"];
          newPl = Math.min(plRemaining + plEarned, 300);

          const slCredit = 20 * (daysEmployed / daysInYear);
          const slUnitsUsed = used["Sick Leave"] * 2;
          const slRemaining = opSl - slUnitsUsed;
          newSl = Math.min(slRemaining + slCredit, 480);
        } else {
          newLycl = 0;
        }

        const insertQuery = `
          INSERT INTO leave_balance (emp_id, year, cl_opening, pl_opening, sl_opening, lycl_opening) 
          VALUES (?, ?, ?, ?, ?, ?) 
          ON DUPLICATE KEY UPDATE cl_opening=VALUES(cl_opening), pl_opening=VALUES(pl_opening), sl_opening=VALUES(sl_opening), lycl_opening=VALUES(lycl_opening)
        `;
        await connection.execute(insertQuery, [
          empId,
          currentYear,
          newCl,
          newPl,
          newSl,
          newLycl,
        ]);
        processedLog.push(empId);
      } catch (empError) {
        errors.push({ emp_id: emp.emp_id, error: empError.message });
      }
    }

    return {
      success: true,
      year: currentYear,
      processed_count: processedLog.length,
      errors: errors,
    };
  } catch (error) {
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { processYearEnd };
