const { pool } = require("../config/database");

// ==========================================
// 1. DASHBOARD & LISTING
// ==========================================

const getDashboardCounts = async () => {
  const query = `
    SELECT 
      COUNT(*) as total_employees,
      SUM(CASE WHEN usercode = '' THEN 1 ELSE 0 END) as inactive_employees,
      SUM(CASE WHEN usercode <> '' THEN 1 ELSE 0 END) as active_employees,
      SUM(CASE WHEN DATE_FORMAT(joindate, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN 1 ELSE 0 END) as new_employees_this_month
    FROM employee
  `;
  const [rows] = await pool.execute(query);
  const result = rows[0];

  return {
    total_employees: parseInt(result.total_employees) || 0,
    inactive_employees: parseInt(result.inactive_employees) || 0,
    active_employees: parseInt(result.active_employees) || 0,
    new_employees_this_month: parseInt(result.new_employees_this_month) || 0,
  };
};

const getEmployees = async (status) => {
  let query =
    "SELECT ename, mno, emp_id, emp_code, email, official_mail, usercode, joindate, post, passphoto, department, gender, active_inactive_status FROM employee";

  if (status === "inactive") {
    query +=
      " WHERE usercode = '' AND post NOT IN ('Variable Tele Assist') ORDER BY emp_code DESC";
  } else if (status === "active") {
    query +=
      " WHERE usercode <> '' AND post NOT IN ('Variable Tele Assist') ORDER BY emp_code DESC";
  } else if (status === "new") {
    query +=
      " WHERE DATE_FORMAT(joindate, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') ORDER BY emp_code DESC";
  } else {
    query +=
      " WHERE post NOT IN ('Variable Tele Assist') ORDER BY emp_code DESC";
  }

  const [rows] = await pool.execute(query);
  return rows;
};

const getEmployeeCounts = async () => {
  const queries = {
    active:
      "SELECT COUNT(*) AS count FROM employee WHERE usercode <> '' AND post NOT IN ('Variable Tele Assist')",
    inactive:
      "SELECT COUNT(*) AS count FROM employee WHERE usercode = '' AND post NOT IN ('Variable Tele Assist')",
    all: "SELECT COUNT(*) AS count FROM employee",
    new: "SELECT COUNT(*) AS count FROM employee WHERE DATE_FORMAT(joindate, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')",
  };

  const results = await Promise.all([
    pool.execute(queries.active),
    pool.execute(queries.inactive),
    pool.execute(queries.all),
    pool.execute(queries.new),
  ]);

  return {
    active: results[0][0][0].count,
    inactive: results[1][0][0].count,
    all: results[2][0][0].count,
    new: results[3][0][0].count,
  };
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const generateEmployeeCode = async () => {
  const query =
    "SELECT MAX(CAST(SUBSTRING(emp_code, 2) AS UNSIGNED)) as max_num FROM employee WHERE emp_code LIKE 'C%'";
  const [rows] = await pool.execute(query);
  const maxNum = rows[0].max_num || 0;
  const nextNum = maxNum + 1;
  return "C" + String(nextNum).padStart(3, "0");
};

const convertExcelDate = (serial) => {
  if (!serial || isNaN(serial)) return "1970-01-01";
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split("T")[0];
};

// ==========================================
// 3. BULK UPLOAD
// ==========================================

const bulkUploadEmployees = async (employeeList) => {
  let successCount = 0;
  let skippedCount = 0;

  try {
    for (let item of employeeList) {
      const clean = (val) => String(val || "").replace(/['"]/g, "");
      const mobile = clean(item["MOBILE NUMBER"]);

      const [existing] = await pool.execute(
        "SELECT count(*) as count FROM employee WHERE mno = ?",
        [mobile]
      );
      if (existing[0].count > 0) {
        skippedCount++;
        continue;
      }

      const empCode = await generateEmployeeCode();
      const joinDate = convertExcelDate(item["JOINDATE"]);
      const dob = convertExcelDate(item["DOB"]);
      const prevDoj = convertExcelDate(item["PREVIOUS COMPANY DOJ"]);
      const prevLwd = convertExcelDate(item["PREVIOUS COMPANY LWD"]);
      const email = clean(item["PERSONAL EMAIL ID"]);
      const pan = clean(item["PANCARD NO"]);
      const aadhar = clean(item["AADHAR NO"]);

      const query = `
        INSERT INTO employee (
            salutation, ename, usercode, descri, post, joindate, password, mno, email, salary,
            inhand_salary, ctc, address, emp_code, dob, pannoo, aadharno, bgrp, qual, state, 
            emno, emergency_relation, emergency_contact_name, city, pincode, state1, city1, pincode1, 
            cdesig, cctc, cname, doj, lwd, remanager, mano, accno, bname, ifsc, official_mail,
            department, company_name, gender, marital_status, fresher_exp, metropolitan, 
            uan_num, pf_number, biometric_id, shift_timing, panno, aadhar,
            
            reporting_manager, candidate_Id, active_inactive_status, report, updates_status, is_saturday_working, 
            last_promotion_date, last_working_date, user_type, employee_type, mobile_app_level,
            admin_permit, profileimg, cheque, edu, passphoto, bstate, payslip, resignation,
            faname, moname, refname, refno, ref_email, ref_1_num, ref_1_name, aadharb, 
            offer_letter, ns, branch, band, office_add, tc_agree, mobile_uid, onboarding_hr, 
            total_work_exp, source, pf_gratuity_applicable, admin_type, admin_access, 
            sub_menu_access, official_letters_pages, ERA
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, '10', ?, ?,

            '0', '', 'Active', 0, 0, 'YES',
            '1970-01-01', '1970-01-01', 'Core', 'Core', '',
            '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '',
            '', '', 0, '', '',
            '', '', ''
        )
      `;

      const params = [
        clean(item["SALUTATION"]),
        clean(item["EMPLOYEE NAME"]),
        empCode,
        clean(item["PERMANENT ADRESS"]),
        clean(item["DESIGNATION"]),
        joinDate,
        clean(item["PASSWORD"]),
        mobile,
        email,
        clean(item["GROSS MONTHLY SALARY"]),
        clean(item["INHAND SALARY"]),
        clean(item["CTC"]),
        clean(item["CURRENT ADDRESS"]),
        empCode,
        dob,
        pan,
        aadhar,
        clean(item["BLOOD GROUP"]),
        clean(item["QUALIFICATION"]),
        clean(item["PERMANENT STATE"]),
        clean(item["EMERGENCY MOBILE NUMBER"]),
        clean(item["EMERGENCY RELATION"]),
        clean(item["EMERGENCY CONTACT NAME"]),
        clean(item["PERMANENT CITY"]),
        clean(item["PERMANENT PINCODE"]),
        clean(item["CURRENT STATE"]),
        clean(item["CURRENT CITY"]),
        clean(item["CURRENT PINCODE"]),
        clean(item["PREVIOUS COMPANY DESIGNATION"]),
        clean(item["PREVIOUS COMPANY CTC"]),
        clean(item["PREVIOUS COMPANY NAME"]),
        prevDoj,
        prevLwd,
        clean(item["PREVIOUS COMPANY MANAGER"]),
        clean(item["PREVIOUS COMPANY MANAGER NO"]),
        clean(item["BANK ACCOUNT NUMBER"]),
        clean(item["BANK NAME"]),
        clean(item["IFSC CODE"]),
        clean(item["OFFICIAL_MAIL"]),
        clean(item["DEPARTMENT"]),
        clean(item["COMPANY_NAME"]),
        clean(item["GENDER"]),
        clean(item["MARITAL STATUS"]),
        clean(item["FRESHER_EXP"]),
        clean(item["METROPOLITAN CITY"]),
        clean(item["UAN NUMBER"]),
        clean(item["PF NUMBER"]),
        clean(item["BIOMETRIC ID"]),
        pan,
        aadhar,
      ];

      await pool.execute(query, params);
      successCount++;
    }

    return {
      success: true,
      message: `Excel Uploaded Successfully. Inserted: ${successCount}, Skipped (Duplicate): ${skippedCount}`,
    };
  } catch (error) {
    throw error;
  }
};

// ==========================================
// 4. REGISTRATION (Multi-Step)
// ==========================================

const processEmployeeRegistration = async (step, data) => {
  let query = "";
  let params = [];
  let responseData = {
    status: true,
    message: "Updated successfully",
    mno: data.mno,
  };

  try {
    if (step == "1") {
      const [existing] = await pool.execute(
        "SELECT * FROM employee WHERE mno = ?",
        [data.mno]
      );

      if (existing.length === 0) {
        const empCode = await generateEmployeeCode();
        responseData.emp_code = empCode;

        query = `
          INSERT INTO employee (
            candidate_Id, salutation, ename, dob, gender, bgrp, marital_status, 
            aadharno, pannoo, uan_num, qual, mno, email, emp_code, usercode,
            descri, post, active_inactive_status, ERA, panno, salary, inhand_salary, ctc,
            admin_permit, aadhar, address, profileimg, cheque, edu, passphoto, bstate, payslip, resignation,
            faname, moname, emno, emergency_relation, emergency_contact_name, city, state, pincode, city1, state1, pincode1,
            cdesig, cctc, cname, doj, lwd, remanager, mano, refname, refno, ref_email, ref_1_num, ref_1_name,
            accno, bname, ifsc, aadharb, offer_letter, ns, official_mail, department, company_name, reporting_manager,
            branch, band, office_add, tc_agree, mobile_uid, onboarding_hr, fresher_exp, total_work_exp, source, user_type,
            mobile_app_level, metropolitan, pf_number, admin_type, admin_access, sub_menu_access, official_letters_pages,
            employee_type, joindate, last_working_date, last_promotion_date,
            report, updates_status, pf_gratuity_applicable, shift_timing, is_saturday_working, password
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
            '', '', 'Active', '', '', '', '', '',
            '', '', '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', 'Core',
            '', '', '', '', '', '', '', 'Core', 
            '1970-01-01', '1970-01-01', '1970-01-01',
            0, 0, 0, 0, 'YES', ''
          )
        `;
        params = [
          data.candidate_Id,
          data.salutation,
          data.ename,
          data.dob,
          data.gender,
          data.bgrp,
          data.MaritalStatus,
          data.aadharno,
          data.pannoo,
          data.uan_Num,
          data.qual,
          data.mno,
          data.email,
          empCode,
          empCode,
        ];
      } else {
        query = `UPDATE employee SET salutation=?, ename=?, dob=?, gender=?, bgrp=?, marital_status=?, aadharno=?, pannoo=?, uan_num=?, qual=?, email=? WHERE mno=?`;
        params = [
          data.salutation,
          data.ename,
          data.dob,
          data.gender,
          data.bgrp,
          data.MaritalStatus,
          data.aadharno,
          data.pannoo,
          data.uan_Num,
          data.qual,
          data.email,
          data.mno,
        ];
      }
    } else if (step == "2") {
      query = `UPDATE employee SET faname=?, moname=?, emergency_contact_name=?, emergency_relation=?, emno=? WHERE mno=?`;
      params = [
        data.faname,
        data.moname,
        data.emergency_contact_name,
        data.emergency_relation,
        data.emno,
        data.mno,
      ];
    } else if (step == "3") {
      query = `UPDATE employee SET descri=?, city=?, state=?, pincode=?, address=?, city1=?, state1=?, pincode1=? WHERE mno=?`;
      params = [
        data.descri,
        data.city,
        data.state,
        data.pincode,
        data.address,
        data.city1,
        data.state1,
        data.pincode1,
        data.mno,
      ];
    } else if (step == "4") {
      query = `UPDATE employee SET bname=?, accno=?, ifsc=? WHERE mno=?`;
      params = [data.bname, data.accno, data.ifsc, data.mno];
    } else if (step == "5") {
      if (data.fresher_exp === "Experience") {
        query = `UPDATE employee SET fresher_exp=?, cname=?, cctc=?, cdesig=?, doj=?, lwd=?, remanager=?, mano=?, refname=?, refno=?, total_work_exp=? WHERE mno=?`;
        params = [
          data.fresher_exp,
          data.cname,
          data.cctc,
          data.cdesig,
          data.doj,
          data.lwd,
          data.remanager,
          data.mano,
          data.refname,
          data.refno,
          data.total_work_exp,
          data.mno,
        ];
      } else {
        query = `UPDATE employee SET fresher_exp='Fresher/Intern' WHERE mno=?`;
        params = [data.mno];
      }
    } else if (step == "6") {
      query = `UPDATE employee SET company_name=?, department=?, post=?, band=?, reporting_manager=?, branch=?, metropolitan=?, onboarding_hr=?, pf_gratuity_applicable=?, ctc=? WHERE mno=?`;
      params = [
        data.company_name,
        data.function,
        data.designation,
        data.band,
        data.reporting_manager,
        data.branch,
        data.metropolitan,
        data.onboarding_hr,
        data.pf_gratuity_applicable,
        data.ctc,
        data.mno,
      ];
    }

    if (query) await pool.execute(query, params);
    return responseData;
  } catch (error) {
    throw error;
  }
};

// ==========================================
// 5. UPDATE FUNCTIONS (For Edit Employee)
// ==========================================

const activateEmployee = async (empId, empCode) => {
  const query = "UPDATE employee SET usercode = ? WHERE emp_id = ?";
  await pool.execute(query, [empCode, empId]);
};

const deactivateEmployee = async (empId) => {
  const query = "UPDATE employee SET usercode = '' WHERE emp_id = ?";
  await pool.execute(query, [empId]);
};

const updatePersonalDetails = async (empId, data) => {
  const query = `UPDATE employee SET ename=?, faname=?, moname=?, mno=?, emno=?, email=?, pannoo=?, aadharno=?, dob=?, bgrp=?, gender=?, qual=?, marital_status=? WHERE emp_id=?`;
  await pool.execute(query, [
    data.FullName,
    data.Fathername,
    data.Mothername,
    data.Contact,
    data.EmergencyContact,
    data.email,
    data.Pan,
    data.AdharNO,
    data.DOB,
    data.BloodGroup,
    data.Gender,
    data.Qualification,
    data.MaritalStatus,
    empId,
  ]);
};

const updateAddressDetails = async (empId, data) => {
  const query = `UPDATE employee SET descri=?, state=?, city=?, pincode=?, address=?, state1=?, city1=?, pincode1=? WHERE emp_id=?`;
  await pool.execute(query, [
    data.PermanentAddress,
    data.PermanentAddressState,
    data.PermanentAddressCity,
    data.PermanentAddressPincode,
    data.CurrentAddress,
    data.CurrentAddressState,
    data.CurrentAddressCity,
    data.CurrentAddressPincode,
    empId,
  ]);
};

const updatePreviousEmployment = async (empId, data) => {
  const query = `UPDATE employee SET cname=?, cctc=?, cdesig=?, doj=?, lwd=?, remanager=?, mano=?, refname=?, refno=? WHERE emp_id=?`;
  await pool.execute(query, [
    data.PreviousCompanyName,
    data.PreviousCompanyCTC,
    data.PreviousCompanyDesignation,
    data.PreviousCompanyDOJ,
    data.PreviousCompanyLWD,
    data.PreviousCompanyReportingManagerName,
    data.PreviousCompanyReportingManagerContact,
    data.RefrenceName,
    data.RefrenceContact,
    empId,
  ]);
};

const updateBankDetails = async (empId, data) => {
  const query = `UPDATE employee SET bname=?, accno=?, ifsc=? WHERE emp_id=?`;
  await pool.execute(query, [
    data.BankName,
    data.BankAccountNumber,
    data.BankIFSC,
    empId,
  ]);
};

// 👇👇👇 FIX IS HERE 👇👇👇
const updateOfficialDetails = async (empId, data) => {
  // Helper to convert ISO format (e.g., 2021-10-31T18:30:00.000Z) or Empty to 'YYYY-MM-DD'
  const formatISO = (dateStr) => {
    if (
      !dateStr ||
      dateStr === "0000:00:00" ||
      dateStr === "undefined" ||
      dateStr === ""
    )
      return "1970-01-01";
    // If it contains T, split it. Else return as is (assuming it's already YYYY-MM-DD)
    return String(dateStr).includes("T")
      ? String(dateStr).split("T")[0]
      : String(dateStr);
  };

  const joinDate = formatISO(data.DateOfJoining);
  const lwd = formatISO(data.lastWorkingDay);

  let promoDate = formatISO(data.lastPromotionDate);
  // Fallback logic
  if (promoDate === "1970-01-01") promoDate = joinDate;

  const query = `
    UPDATE employee SET 
      joindate=?, last_working_date=?, salary=?, inhand_salary=?, ctc=?, password=?, 
      company_name=?, department=?, post=?, reporting_manager=?, band=?, branch=?, 
      onboarding_hr=?, user_type=?, active_inactive_status=?, mobile_app_level=?, 
      metropolitan=?, updates_status='1', official_mail=?, ns=?, pf_gratuity_applicable=?, 
      ERA=?, uan_num=?, pf_number=?, shift_timing=?, biometric_id=?, 
      is_saturday_working=?, last_promotion_date=? 
    WHERE emp_id=?
  `;

  await pool.execute(query, [
    joinDate,
    lwd,
    data.MonthlyGrossSalary,
    data.MonthlyInHandSalary,
    data.YearlyCTC,
    data.PassWord,
    data.OrganizationName,
    data.functiondept,
    data.designation,
    data.reportingManager,
    data.Band,
    data.OfficeLocation,
    data.hrSpocName,
    data.UserType,
    data.SalaryStatus,
    data.MobileAppLevel,
    data.UserLocation,
    data.officialMail,
    data.SalaryCriteria,
    data.PFstatus,
    data.ERA,
    data.uanNumber,
    data.pf,
    data.shiftTiming,
    data.biometric_id,
    data.isSaturday,
    promoDate,
    empId,
  ]);
};

// ==========================================
// 6. GETTERS & HELPERS
// ==========================================

const getEmployeeByMobile = async (mno) => {
  const query = "SELECT * FROM employee WHERE mno = ?";
  const [rows] = await pool.execute(query, [mno]);
  return rows;
};

const getHrEmployees = async () => {
  const query = `SELECT * FROM employee WHERE (post LIKE '%Human%' OR post LIKE '%HR%' OR post LIKE '%Specialist - Talent Management%') AND usercode <> ''`;
  const [rows] = await pool.execute(query);
  return rows;
};

const getReportingManagers = async (orgName) => {
  let query = `SELECT UPPER(ename) AS name, official_mail, mno, emp_id, usercode, company_name FROM employee WHERE usercode <> '' AND official_mail <> ''`;
  let params = [];
  if (orgName && orgName !== "undefined" && orgName.trim() !== "") {
    query += " AND company_name = ?";
    params.push(orgName);
  }
  const [rows] = await pool.execute(query, params);
  return rows;
};

const updateSingleDocument = async (empId, type, fileName) => {
  let column = "";
  switch (type) {
    case "af":
      column = "aadhar";
      break;
    case "ab":
      column = "aadharb";
      break;
    case "cl":
      column = "cheque";
      break;
    case "pc":
      column = "panno";
      break;
    case "bs":
      column = "bstate";
      break;
    case "ps":
      column = "payslip";
      break;
    case "rap":
      column = "resignation";
      break;
    case "ol":
      column = "offer_letter";
      break;
    case "edu":
      column = "edu";
      break;
    case "psp":
      column = "passphoto";
      break;
    default:
      column = "passph";
      break;
  }
  const query = `UPDATE employee SET ${column} = ? WHERE emp_id = ?`;
  const [result] = await pool.execute(query, [fileName, empId]);
  return result;
};

const updateEmployeeDocs = async (mno, filesData) => {
  const query = `UPDATE employee SET passphoto = ?, aadhar = ?, aadharb = ?, panno = ?, edu = ?, bstate = ?, cheque = ?, offer_letter = ?, payslip = ?, resignation = ? WHERE mno = ?`;
  const params = [
    filesData.passphoto || "",
    filesData.aadhar || "",
    filesData.aadharb || "",
    filesData.panno || "",
    filesData.edu || "",
    filesData.bstate || "",
    filesData.cheque || "",
    filesData.offer_letter || "",
    filesData.payslip || "",
    filesData.resignation || "",
    mno,
  ];
  const [result] = await pool.execute(query, params);
  return result;
};

const getEmployeeById = async (empId) => {
  const query = "SELECT * FROM employee WHERE emp_id = ?";
  const [rows] = await pool.execute(query, [empId]);
  return rows;
};

const changePasswordService = async (emp_id, old_password, new_password) => {
  // 1. Fetch current password
  const [user] = await pool.execute(
    "SELECT password FROM employee WHERE emp_id = ?",
    [emp_id]
  );

  if (user.length === 0) {
    return { status: false, message: "User not found." };
  }

  const currentDbPassword = user[0].password;

  // 2. Verify Old Password
  if (currentDbPassword !== old_password) {
    return { status: false, message: "Incorrect old password." };
  }

  // 3. Update to New Password
  const updateQuery = "UPDATE employee SET password = ? WHERE emp_id = ?";
  const [result] = await pool.execute(updateQuery, [new_password, emp_id]);

  if (result.affectedRows > 0) {
    return { status: true, message: "Password changed successfully!" };
  } else {
    return { status: false, message: "Failed to update password." };
  }
};

const getTeamMembersByManagerId = async (managerId) => {
  try {
    const query = `
      SELECT 
        emp_id,
        usercode,
        ename,
        email,
        official_mail,
        post as designation,
        department,
        mno as mobile,
        profileimg,
        passphoto,
        joindate,
        employee_type,
        active_inactive_status
      FROM employee 
      WHERE reporting_manager = ? 
      AND active_inactive_status = 'Active' 
      AND emp_id != ? -- Exclude the manager themselves if they list themselves
    `;

    // We pass managerId twice: once for the check, once to exclude self
    const [rows] = await pool.execute(query, [managerId, managerId]);
    return rows;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getEmployees,
  getEmployeeCounts,
  getDashboardCounts,
  processEmployeeRegistration,
  bulkUploadEmployees,
  activateEmployee,
  deactivateEmployee,
  updatePersonalDetails,
  updateAddressDetails,
  updatePreviousEmployment,
  updateBankDetails,
  updateOfficialDetails,
  getEmployeeByMobile,
  getHrEmployees,
  getReportingManagers,
  updateSingleDocument,
  updateEmployeeDocs,
  getEmployeeById,
  changePasswordService,
  getTeamMembersByManagerId,
};
