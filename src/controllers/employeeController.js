const employeeService = require("../services/employeeService");
const { pool } = require("../config/database");

// ==========================================
// 1. GET LIST & STATS
// ==========================================

const getEmployeeStats = async (req, res) => {
  try {
    const data = await employeeService.getDashboardCounts();
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getEmployeeStats:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

const getEmployeeDetails = async (req, res) => {
  try {
    const { status } = req.query;

    const [employeesRaw, counts] = await Promise.all([
      employeeService.getEmployees(status),
      employeeService.getEmployeeCounts(),
    ]);

    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

    const formattedEmployees = employeesRaw.map((emp) => {
      const fullPhotoUrl = emp.passphoto
        ? `${baseUrl}/admin/Upload/${emp.passphoto}`
        : null;

      return {
        ename: emp.ename,
        emp_id: emp.emp_id,
        mno: emp.mno,
        emp_code: emp.emp_code,
        email: emp.email,
        official_mail: emp.official_mail,
        usercode: emp.usercode,
        joindate: emp.joindate,
        post: emp.post,
        department: emp.department,
        passphoto: fullPhotoUrl,
        gender: emp.gender,
        active_inactive_status: emp.active_inactive_status,
      };
    });

    res.status(200).json({
      employees: formattedEmployees,
      counts: counts,
    });
  } catch (error) {
    console.error("Error in getEmployeeDetails:", error);
    res.status(500).json({ status: "error", message: "Server Error" });
  }
};

// ==========================================
// 2. REGISTRATION (Multi-Step)
// ==========================================

const registerEmployee = async (req, res) => {
  try {
    const data = req.body;
    const step = String(data.step);

    if (!step || !data.mno) {
      return res
        .status(400)
        .json({ status: false, message: "Missing 'step' or 'mno'" });
    }

    // Helper to sanitize strings (Remove #, ', ", ;)
    const clean = (val) => (val ? String(val).replace(/[#'";]/g, "") : "");

    // Prepare clean data object matching DB columns & Service params
    const cleanData = {
      ...data,
      step: step,
      // Common fields
      mno: clean(data.mno),

      // Step 1
      candidate_Id: clean(data.candidate_Id),
      salutation: clean(data.salutation),
      ename: clean(data.ename),
      dob: clean(data.dob),
      gender: clean(data.gender),
      bgrp: clean(data.bgrp),
      MaritalStatus: clean(data.MaritalStatus),
      aadharno: clean(data.aadharno),
      pannoo: clean(data.pannoo),
      uan_Num: clean(data.uan_Num), // Input mapped to DB uan_num
      qual: clean(data.qual),
      email: clean(data.email),

      // Step 2
      faname: clean(data.faname),
      moname: clean(data.moname),
      emergency_contact_name: clean(data.emergency_contact_name),
      emergency_relation: clean(data.emergency_relation),
      emno: clean(data.emno),

      // Step 3
      descri: clean(data.descri),
      city: clean(data.city),
      state: clean(data.state),
      pincode: clean(data.pincode),
      address: clean(data.address),
      city1: clean(data.city1),
      state1: clean(data.state1),
      pincode1: clean(data.pincode1),

      // Step 4
      bname: clean(data.bname),
      accno: clean(data.accno),
      ifsc: clean(data.ifsc),

      // Step 5
      fresher_exp: data.fresher_exp, // Boolean/Flag logic
      cname: clean(data.cname),
      cctc: clean(data.cctc),
      cdesig: clean(data.cdesig),
      doj: clean(data.doj),
      lwd: clean(data.lwd),
      remanager: clean(data.remanager),
      mano: clean(data.mano),
      refname: clean(data.refname),
      refno: clean(data.refno),
      total_work_exp: clean(data.total_work_exp),

      // Step 6 (Mapping Input -> DB)
      company_name: clean(data.company_name),
      function: clean(data.function), // Input 'function' -> DB 'department'
      designation: clean(data.designation), // Input 'designation' -> DB 'post'
      band: clean(data.band),
      reporting_manager: clean(data.reporting_manager),
      branch: clean(data.branch),
      metropolitan: clean(data.metropolitan),
      onboarding_hr: clean(data.onboarding_hr),
      pf_gratuity_applicable:
        data.pf_gratuity_applicable === "Yes" ||
        data.pf_gratuity_applicable === "1"
          ? 1
          : 0,
      ctc: clean(data.ctc),
    };

    const result = await employeeService.processEmployeeRegistration(
      step,
      cleanData
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in registerEmployee:", error);
    res.status(500).json({ status: false, error: error.message });
  }
};
const getAddEmployeeData = async (req, res) => {
  try {
    // 1. Get Input (Support both POST body and GET query)
    let rawMno = req.body.mno || req.query.mno;

    if (!rawMno) {
      return res.status(200).json({
        status: false,
        data: [],
        message: "Mobile number is missing",
      });
    }

    // 2. Sanitize (Matches PHP: str_replace(array("#", "'", ";", '"'), '', $mno))
    // Removes #, ', ;, and " characters
    const mno = String(rawMno).replace(/[#';"]/g, "");

    // 3. Fetch Data
    const employees = await employeeService.getEmployeeByMobile(mno);

    // 4. Send Response
    if (employees.length > 0) {
      res.status(200).json({
        status: true,
        data: [employees[0]], // Wrap in array to match PHP structure
        message: "Employee data retrieved successfully",
      });
    } else {
      res.status(200).json({
        status: false,
        data: [],
        message: "No employee found with this mobile number",
      });
    }
  } catch (error) {
    console.error("Error in getAddEmployeeData:", error);
    // Return 200 with error message to match PHP behavior
    res.status(200).json({
      status: false,
      data: [],
      message: "Database query failed: " + error.message,
    });
  }
};
const getHrNames = async (req, res) => {
  try {
    const hrList = await employeeService.getHrEmployees();

    if (hrList.length > 0) {
      res.status(200).json({
        status: true,
        data: hrList,
        message: "data found",
      });
    } else {
      res.status(200).json({
        status: false,
        data: [],
        errormessage: "Sorry No Record Found", // Matching PHP key
      });
    }
  } catch (error) {
    console.error("Error in getHrNames:", error);
    res.status(500).json({ status: false, errormessage: "Server Error" });
  }
};
const getReportingManagersList = async (req, res) => {
  try {
    // Check both Query (GET) and Body (POST)
    const org_name = req.query.org_name || req.body.org_name;

    const data = await employeeService.getReportingManagers(org_name);

    if (data.length > 0) {
      res.status(200).json({
        status: true,
        data: data,
        message: "Data found",
      });
    } else {
      res.status(200).json({
        status: false,
        data: [], // Empty array
        message: "",
        errormessage: "Sorry, no record found", // Matching PHP response key
      });
    }
  } catch (error) {
    console.error("Error in getReportingManagersList:", error);
    res.status(500).json({
      status: false,
      message: "",
      errormessage: "Server Error",
    });
  }
};

const uploadEmployeeDocuments = async (req, res) => {
  try {
    const { mno } = req.body;

    // 1. Validation
    if (!mno) {
      return res
        .status(200)
        .json({ error: "Employee ID (mno) is a required parameter" });
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(200)
        .json({ error: "Sorry, only JPG, JPEG, PNG & GIF files are allowed" });
    }

    // 2. Map Files to Columns
    // PHP Logic Mapping:
    // file_1 -> passphoto
    // file_2 -> aadhar
    // file_3 -> aadharb
    // file_4 -> panno
    // file_5 -> edu
    // file_6 -> bstate
    // file_7 -> cheque
    // file_8 -> offer_letter
    // file_9 -> payslip
    // file_10 -> resignation

    const fileMapping = {
      file_1: "passphoto",
      file_2: "aadhar",
      file_3: "aadharb",
      file_4: "panno",
      file_5: "edu",
      file_6: "bstate",
      file_7: "cheque",
      file_8: "offer_letter",
      file_9: "payslip",
      file_10: "resignation",
    };

    const filesData = {};

    // Loop through uploaded files and assign filenames to correct columns
    req.files.forEach((file) => {
      const dbColumn = fileMapping[file.fieldname];
      if (dbColumn) {
        filesData[dbColumn] = file.filename; // Multer has already renamed it
      }
    });

    // 3. Update Database
    await employeeService.updateEmployeeDocs(mno, filesData);

    res.status(200).json({
      message: "Your Document Detail has been updated successfully",
    });
  } catch (error) {
    console.error("Error in uploadEmployeeDocuments:", error);
    res.status(200).json({ error: "Could not update data: " + error.message });
  }
};

const getEditEmployeeDetails = async (req, res) => {
  try {
    // PHP used POST body: $data->emp_id
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(200).json({
        status: "error",
        message: "Missing emp_id",
      });
    }

    const employees = await employeeService.getEmployeeById(emp_id);

    // Response structure matches PHP exactly
    res.status(200).json({
      status: "success",
      employees: employees,
    });
  } catch (error) {
    console.error("Error in getEditEmployeeDetails:", error);
    res.status(200).json({
      status: "error",
      message: "Failed to fetch employee details",
    });
  }
};

const updateDocument = async (req, res) => {
  try {
    // 1. Check for File
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded or invalid file type.",
      });
    }

    // 2. Get Inputs (Support POST Body OR GET Query params)
    // PHP used $_GET for these, so we must check req.query
    const emp_id = req.body.emp_id || req.query.emp_id;
    const type = req.body.type || req.query.type;

    // 3. Validation
    if (!emp_id || !type) {
      return res.status(400).json({
        status: false,
        message: "Missing emp_id or type",
      });
    }

    // 4. File Size Check (1MB)
    if (req.file.size > 1 * 1024 * 1024) {
      return res.status(400).json({
        status: false,
        message: "Error: File size exceeds the maximum allowed size (1 MB).",
      });
    }

    const fileName = req.file.filename;

    // 5. Update Database
    await employeeService.updateSingleDocument(emp_id, type, fileName);

    res.status(200).json({
      status: true,
      message: "Successfully Updated Employee Document Details",
    });
  } catch (error) {
    console.error("Error in updateDocument:", error);
    res.status(500).json({
      status: false,
      message: "Error updating document details: " + error.message,
    });
  }
};

const uploadBulkEmployees = async (req, res) => {
  try {
    const { list } = req.body;

    if (!list || !Array.isArray(list) || list.length === 0) {
      return res.status(400).json({
        success: false,
        message: "JSON parser error or empty list",
      });
    }

    const result = await employeeService.bulkUploadEmployees(list);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in uploadBulkEmployees:", error);
    res.status(500).json({
      success: false,
      message: "Database insert error: " + error.message,
    });
  }
};

const getEmployeesByDepartment = async (req, res) => {
  try {
    const { department, usercode } = req.body;
    if (!department) {
      return res.json({
        status: false,
        message: "Please provide a 'department' to filter by.",
      });
    }
    let query = `
      SELECT * FROM employee 
      WHERE department = ? 
      AND (active_inactive_status = 'active' OR active_inactive_status = 'Active')
    `;

    let queryParams = [department];
    if (usercode) {
      query += ` AND usercode != ?`;
      queryParams.push(usercode);
    }

    const [rows] = await pool.execute(query, queryParams);

    if (rows.length > 0) {
      return res.json({
        status: true,
        message: "Data found",
        total: rows.length,
        data: rows,
      });
    } else {
      return res.json({
        status: false,
        message: "No colleagues found in this department.",
        data: [],
      });
    }
  } catch (error) {
    console.error("Error fetching employees:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { emp_id, old_password, new_password } = req.body;

    // 1. Basic Input Validation
    if (!emp_id || !old_password || !new_password) {
      return res.json({
        status: false,
        message: "Please provide Employee ID, Old Password, and New Password.",
      });
    }

    // 2. Call the Service
    const result = await employeeService.changePasswordService(
      emp_id,
      old_password,
      new_password
    );

    // 3. Send Response
    return res.json(result);
  } catch (error) {
    console.error("Change Password Controller Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
const getMyTeamList = async (req, res) => {
  try {
    // Expecting the Manager's emp_id in the body
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(200).json({ 
        status: false, 
        message: "Manager Employee ID is required" 
      });
    }

    const teamMembers = await employeeService.getTeamMembersByManagerId(emp_id);

    if (teamMembers.length > 0) {
      
      // Optional: Add base URL to profile images if needed
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}/admin/Upload/`; 
      const formattedData = teamMembers.map(member => ({
        ...member,
        passphoto: member.passphoto ? `${baseUrl}${member.passphoto}` : null
      }));

      return res.status(200).json({
        status: true,
        message: "Team members found",
        total_members: teamMembers.length,
        data: formattedData
      });
    } else {
      return res.status(200).json({
        status: false,
        message: "No team members found under this manager",
        data: []
      });
    }

  } catch (error) {
    console.error("Error fetching team list:", error);
    return res.status(500).json({ 
      status: false, 
      message: "Server Error: " + error.message 
    });
  }
};

module.exports = {
  getEmployeeDetails,
  getEmployeeStats,
  registerEmployee,
  getAddEmployeeData,
  getHrNames,
  getReportingManagersList,
  uploadEmployeeDocuments,
  getEditEmployeeDetails,
  updateDocument,
  uploadBulkEmployees,
  getEmployeesByDepartment,
  changePassword,
  getMyTeamList,
};
