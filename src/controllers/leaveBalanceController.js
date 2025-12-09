const leaveService = require("../services/leaveService");

const getLeaveBalance = async (req, res) => {
  try {
    const { emp_id, date } = req.query;
    if (!emp_id || !date)
      return res.status(400).json({ error: "Missing Parameters" });

    const currentYear = new Date(date).getFullYear();
    const empData = await leaveService.getEmployeeDetails(emp_id);
    if (!empData) return res.status(404).json({ error: "Employee not found" });

    const joinDate = new Date(empData.joindate);
    const gender = empData.gender
      ? empData.gender.trim().toUpperCase()
      : "MALE";
    // UPDATED: Use employee_type from DB
    const employeeType = empData.employee_type || "Core";

    // 1. Fetch Dynamic Rules
    const rules = await leaveService.getLeaveConfiguration(employeeType);
    const getLimit = (lName) => {
      const rule = rules.find((r) => r.leave_type === lName);
      return rule ? parseFloat(rule.annual_limit) : 0;
    };

    // 2. Probation Status (Strict check against new Enum)
    const isProbation = employeeType === "Core Probation";

    // Service Calcs
    const serverDate = new Date(date);
    const diffTime = Math.abs(serverDate - joinDate);
    const daysWorked = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const monthsService = Math.floor(daysWorked / 30);

    // 3. Opening Balances
    const balanceRow = await leaveService.getOpeningBalance(
      empData.emp_id,
      currentYear
    );

    let OP_CL = balanceRow
      ? parseFloat(balanceRow.cl_opening)
      : getLimit("Casual Leave");
    let OP_PL = balanceRow
      ? parseFloat(balanceRow.pl_opening)
      : getLimit("Privilege Leave");
    let OP_SL = balanceRow
      ? parseFloat(balanceRow.sl_opening)
      : getLimit("Sick Leave");
    let OP_LYCL = balanceRow ? parseFloat(balanceRow.lycl_opening) : 0;

    // 4. Overrides
    if (isProbation) {
      OP_PL = 0;
      OP_SL = 0;
      OP_LYCL = 0;
      OP_CL = Math.floor(daysWorked / 45); // 1 CL per 45 days
    } else if (employeeType === "Contractual") {
      OP_PL = Math.min(OP_PL, monthsService * 1); // 1 PL per month
      const proRataCL = Math.floor(daysWorked / 45);
      OP_CL = Math.min(OP_CL, proRataCL);
    }

    // 5. Usage
    const annualRows = await leaveService.getAnnualLeavesTaken(
      empData.emp_id,
      currentYear
    );
    const lifetimeRows = await leaveService.getLifetimeLeavesTaken(
      empData.emp_id
    );

    const mapTaken = (rows) => {
      const map = {};
      rows.forEach((r) => (map[r.ltype] = parseFloat(r.days_taken)));
      return map;
    };
    const takenAnnual = mapTaken(annualRows);
    const takenLifetime = mapTaken(lifetimeRows);
    const getTaken = (map, key) => map[key] || 0;

    const leaves = {};

    // 6. Build Response (Only show if allowed in DB Config)
    if (rules.some((r) => r.leave_type === "Casual Leave")) {
      const clAvail = getTaken(takenAnnual, "Casual Leave");
      leaves["Casual Leave"] = {
        Total: OP_CL,
        Availed: clAvail,
        Balance: Math.max(OP_CL - clAvail, 0),
      };
    }

    if (rules.some((r) => r.leave_type === "Privilege Leave")) {
      const plAvail = getTaken(takenAnnual, "Privilege Leave");
      leaves["Privilege Leave"] = {
        Total: OP_PL,
        Availed: plAvail,
        Balance: Math.max(OP_PL - plAvail, 0),
      };
    }

    if (rules.some((r) => r.leave_type === "Sick Leave")) {
      const slDaysTaken = getTaken(takenAnnual, "Sick Leave");
      const slUnitsTaken = slDaysTaken * 2;
      leaves["Sick Leave"] = {
        Total: OP_SL,
        Availed: slUnitsTaken,
        Balance: Math.max(OP_SL - slUnitsTaken, 0),
      };
    }

    if (rules.some((r) => r.leave_type === "LYCL") && !isProbation) {
      const lyclAvail = getTaken(takenAnnual, "LYCL");
      leaves["LYCL (Carry Fwd)"] = {
        Total: OP_LYCL,
        Availed: lyclAvail,
        Balance: Math.max(OP_LYCL - lyclAvail, 0),
      };
    }

    // Gender Specific
    if (gender === "FEMALE") {
      ["Maternity (Pregnancy)", "Maternity (Abortion)"].forEach((key) => {
        if (rules.some((r) => r.leave_type === key)) {
          const limit = getLimit(key);
          const availed =
            getTaken(takenLifetime, key) +
            (key === "Maternity (Pregnancy)"
              ? getTaken(takenLifetime, "Maternity Leave")
              : 0);
          leaves[key] = {
            Total: limit,
            Availed: availed,
            Balance: Math.max(limit - availed, 0),
          };
        }
      });

      const femaleSCL = [
        "SCL - Tubectomy",
        "SCL - IUD Insertion",
        "SCL - IUCD Insertion",
        "SCL - MTP Salpingectomy",
        "SCL - Recanalization",
        "SCL - Husband Vasectomy",
      ];
      femaleSCL.forEach((key) => {
        if (rules.some((r) => r.leave_type === key)) {
          let limit = getLimit(key);
          const availed = getTaken(takenLifetime, key);
          if (key === "SCL - Tubectomy" && availed >= 14) limit = 28;
          leaves[key] = {
            Total: limit,
            Availed: availed,
            Balance: Math.max(limit - availed, 0),
          };
        }
      });
    } else {
      if (rules.some((r) => r.leave_type === "Paternity Leave")) {
        const limit = getLimit("Paternity Leave");
        const availed = getTaken(takenAnnual, "Paternity Leave");
        leaves["Paternity Leave"] = {
          Total: limit,
          Availed: availed,
          Balance: Math.max(limit - availed, 0),
        };
      }
      const maleSCL = [
        "SCL - Vasectomy",
        "SCL - Recanalization",
        "SCL - Wife Tubectomy",
      ];
      maleSCL.forEach((key) => {
        if (rules.some((r) => r.leave_type === key)) {
          let limit = getLimit(key);
          const availed = getTaken(takenLifetime, key);
          if (key === "SCL - Vasectomy" && availed >= 6) limit = 12;
          leaves[key] = {
            Total: limit,
            Availed: availed,
            Balance: Math.max(limit - availed, 0),
          };
        }
      });
    }

    // Others
    rules.forEach((r) => {
      const type = r.leave_type;
      if (
        [
          "Casual Leave",
          "Privilege Leave",
          "Sick Leave",
          "LYCL",
          "Paternity Leave",
        ].includes(type)
      )
        return;
      if (
        type.includes("Maternity") ||
        type.includes("SCL") ||
        type.includes("LWP") ||
        type.includes("Extraordinary")
      )
        return;

      const limit = parseFloat(r.annual_limit);
      const availed = getTaken(takenAnnual, type);
      leaves[type] = {
        Total: limit,
        Availed: availed,
        Balance: Math.max(limit - availed, 0),
      };
    });

    res
      .status(200)
      .json({
        meta: {
          emp_id,
          gender,
          is_probation: isProbation,
          user_type: employeeType,
        },
        leaves,
      });
  } catch (error) {
    console.error("Error in leave balance:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = { getLeaveBalance };
