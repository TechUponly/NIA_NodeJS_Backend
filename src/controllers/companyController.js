const companyService = require("../services/companyService");

// 1. Get Company Dropdown
const getCompanyDropdown = async (req, res) => {
  try {
    const companies = await companyService.getCompanyList();

    res.status(200).json({
      status: true,
      message: "Data retrieved successfully",
      companies: companies
    });

  } catch (error) {
    console.error("Error in getCompanyDropdown:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

// 2. Get Departments
const getDepartments = async (req, res) => {
  try {
    // Support GET (query) and POST (body)
    const org_name = req.query.org_name || req.body.org_name;

    // Use empty string if undefined (matches PHP behavior)
    const safeOrgName = org_name || '';

    const departments = await companyService.getDepartmentsByOrg(safeOrgName);

    res.status(200).json({
      departments: departments
    });

  } catch (error) {
    console.error("Error in getDepartments:", error.message);
    // Return detailed error for debugging 500s
    res.status(500).json({ status: false, message: "Server Error: " + error.message });
  }
};

const getDesignations = async (req, res) => {
  try {
    // Support GET and POST
    const department = req.query.department || req.body.department;

    // Use empty string if undefined to avoid SQL errors
    const safeDept = department || '';

    const designations = await companyService.getDesignationsByDept(safeDept);

    // Response format matches PHP: { "designation": [...] }
    res.status(200).json({
      designation: designations
    });

  } catch (error) {
    console.error("Error in getDesignations:", error.message);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

const getBands = async (req, res) => {
  try {
    // Support GET and POST
    const designation = req.query.designation || req.body.designation;

    // Use empty string if undefined to avoid SQL errors
    const safeDesignation = designation || '';

    const bands = await companyService.getBandsByDesignation(safeDesignation);

    // Response format matches PHP: { "band": [...] }
    res.status(200).json({
      band: bands
    });

  } catch (error) {
    console.error("Error in getBands:", error.message);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

module.exports = {
  getCompanyDropdown,
  getDepartments,
  getDesignations,
  getBands,
};