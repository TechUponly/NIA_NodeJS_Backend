const leaveBalanceService = require("../services/leaveBalanceService");

const getLeaveBalance = async (req, res, next) => {
  try {
    const { emp_id, date } = req.query;

    // 1. Validation
    if (!emp_id || !date) {
      return res.status(400).json({ error: "Missing Parameters (emp_id or date)" });
    }

    // 2. Date Setup
    const inputDate = new Date(date);
    const currentYear = inputDate.getFullYear();
    const startOfYear = `${currentYear}-01-01`;
    const endOfYear = `${currentYear}-12-31`;

    // 3. Fetch Employee
    const empData = await leaveBalanceService.getEmployeeDetails(emp_id);
    if (!empData) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const joinDate = new Date(empData.joindate);
    const gender = empData.gender ? empData.gender.trim().toUpperCase() : "MALE"; // Default to Male if missing

    // 4. Probation Logic
    // Probation ends 1 year after join date
    const probationEndDate = new Date(joinDate);
    probationEndDate.setFullYear(probationEndDate.getFullYear() + 1);

    // Current Server Date for comparison
    const today = new Date(); 
    const isProbation = today <= probationEndDate;

    // Days worked calculation: (Input Date - Join Date) in days
    const diffTime = Math.abs(inputDate - joinDate);
    const daysWorked = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

    // 5. Fetch Opening Balances
    const balanceRow = await leaveBalanceService.getOpeningBalance(emp_id, currentYear);

    // Defaults if no row found (matching PHP logic)
    let OP_CL = balanceRow ? parseFloat(balanceRow.cl_opening) : 8;
    let OP_PL = balanceRow ? parseFloat(balanceRow.pl_opening) : 0;
    let OP_SL = balanceRow ? parseFloat(balanceRow.sl_opening) : 0;
    let OP_LYCL = balanceRow ? parseFloat(balanceRow.lycl_opening) : 0;

    // Probation Override Logic
    if (isProbation) {
      OP_PL = 0;
      OP_SL = 0;
      OP_LYCL = 0;
      // 1 CL per 45 days service
      OP_CL = daysWorked > 0 ? Math.floor(daysWorked / 45) : 0;
    }

    // 6. Fetch Leaves Taken
    const annualTakenRaw = await leaveBalanceService.getAnnualLeavesTaken(emp_id, startOfYear, endOfYear);
    const lifetimeTakenRaw = await leaveBalanceService.getLifetimeLeavesTaken(emp_id);

    // Helper to map DB rows to a simple Object { 'Leave Name': count }
    const mapTaken = (rows) => {
      const map = {};
      rows.forEach(r => {
        map[r.ltype] = parseFloat(r.days_taken || 0);
      });
      return map;
    };

    const takenAnnual = mapTaken(annualTakenRaw);
    const takenLifetime = mapTaken(lifetimeTakenRaw);

    // Helper to safely get value
    const getTaken = (map, key) => map[key] || 0;

    // 7. Calculate Balances
    const leaves = {};

    // --- A. Standard Leaves ---
    
    // Casual Leave
    const clAvail = getTaken(takenAnnual, 'Casual Leave');
    leaves['Casual Leave'] = {
      Total: OP_CL,
      Availed: clAvail,
      Balance: Math.max(OP_CL - clAvail, 0)
    };

    // Privilege Leave
    const plAvail = getTaken(takenAnnual, 'Privilege Leave');
    leaves['Privilege Leave'] = {
      Total: OP_PL,
      Availed: plAvail,
      Balance: Math.max(OP_PL - plAvail, 0)
    };

    // Sick Leave (Half-Pay Units logic)
    const slDaysTaken = getTaken(takenAnnual, 'Sick Leave');
    const slUnitsTaken = slDaysTaken * 2; // PHP: $sl_days_taken * 2
    leaves['Sick Leave'] = {
      Total: OP_SL,
      Availed: slUnitsTaken,
      Balance: Math.max(OP_SL - slUnitsTaken, 0)
    };

    // LYCL
    const lyclAvail = getTaken(takenAnnual, 'LYCL');
    leaves['LYCL (Carry Fwd)'] = {
      Total: OP_LYCL,
      Availed: lyclAvail,
      Balance: Math.max(OP_LYCL - lyclAvail, 0)
    };

    // --- B. Gender Specific Leaves ---

    if (gender === 'FEMALE') {
      // Maternity (Pregnancy) - Lifetime Check
      const matAvail = getTaken(takenLifetime, 'Maternity (Pregnancy)') + getTaken(takenLifetime, 'Maternity Leave');
      leaves['Maternity (Pregnancy)'] = {
        Total: 360,
        Availed: matAvail,
        Balance: Math.max(360 - matAvail, 0)
      };

      // Maternity (Abortion) - Lifetime Check
      const abortAvail = getTaken(takenLifetime, 'Maternity (Abortion)');
      leaves['Maternity (Abortion)'] = {
        Total: 45,
        Availed: abortAvail,
        Balance: Math.max(45 - abortAvail, 0)
      };

      // Female SCLs
      const femaleScl = {
        'SCL - Tubectomy': 14,
        'SCL - IUD Insertion': 1,
        'SCL - IUCD Insertion': 1,
        'SCL - MTP Salpingectomy': 14,
        'SCL - Recanalization': 21,
        'SCL - Husband Vasectomy': 1
      };

      for (const [name, defaultLimit] of Object.entries(femaleScl)) {
        let limit = defaultLimit;
        const availed = getTaken(takenLifetime, name);

        // Dynamic Extension: Tubectomy 14 -> 28
        if (name === 'SCL - Tubectomy' && availed >= 14) {
          limit = 28;
        }

        leaves[name] = {
          Total: limit,
          Availed: availed,
          Balance: Math.max(limit - availed, 0)
        };
      }

    } else {
      // MALE Logic
      
      // Paternity - Using Annual Check (matching standard logic)
      const patAvail = getTaken(takenAnnual, 'Paternity Leave');
      leaves['Paternity Leave'] = {
        Total: 15,
        Availed: patAvail,
        Balance: Math.max(15 - patAvail, 0)
      };

      // Male SCLs
      const maleScl = {
        'SCL - Vasectomy': 6,
        'SCL - Recanalization': 21,
        'SCL - Wife Tubectomy': 7
      };

      for (const [name, defaultLimit] of Object.entries(maleScl)) {
        let limit = defaultLimit;
        const availed = getTaken(takenLifetime, name); // SCL is usually lifetime check

        // Dynamic Extension: Vasectomy 6 -> 12
        if (name === 'SCL - Vasectomy' && availed >= 6) {
          limit = 12;
        }

        leaves[name] = {
          Total: limit,
          Availed: availed,
          Balance: Math.max(limit - availed, 0)
        };
      }
    }

    // 8. Response
    const meta = {
      emp_id,
      gender,
      is_probation: isProbation,
      join_date: empData.joindate, // Format: YYYY-MM-DD
      server_date: date
    };

    res.status(200).json({
      meta,
      leaves
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLeaveBalance
};