const Joi = require("joi");

// Employee validation schema based on your actual database structure
const employeeSchema = Joi.object({
  // Required fields
  salutation: Joi.string().max(50).required(),
  ename: Joi.string().min(2).max(255).required(),
  usercode: Joi.string().max(255).required(),
  descri: Joi.string().max(500).required(),
  post: Joi.string().max(255).required(),
  joindate: Joi.date().required(),
  last_working_date: Joi.date().required(),
  password: Joi.string().min(6).max(255).required(),
  mno: Joi.string().max(11).required(),
  email: Joi.string().email().max(255).required(),
  panno: Joi.string().max(255).required(),
  salary: Joi.string().max(255).required(),
  inhand_salary: Joi.string().max(250).required(),
  ctc: Joi.string().max(250).required(),
  admin_permit: Joi.string().max(255).required(),
  aadhar: Joi.string().max(255).required(),
  address: Joi.string().max(300).required(),
  emp_code: Joi.string().max(255).required(),

  // Optional fields with defaults
  profileimg: Joi.string().max(255).default(""),
  cheque: Joi.string().max(255).default(""),
  edu: Joi.string().max(255).default(""),
  passphoto: Joi.string().max(255).default(""),
  bstate: Joi.string().max(255).default(""),
  payslip: Joi.string().max(255).default(""),
  resignation: Joi.string().max(255).default(""),
  dob: Joi.string().max(255).default(""),
  faname: Joi.string().max(255).default(""),
  moname: Joi.string().max(255).default(""),
  pannoo: Joi.string().max(255).default(""),
  aadharno: Joi.string().max(255).default(""),
  bgrp: Joi.string().max(255).default(""),
  qual: Joi.string().max(250).default(""),
  state: Joi.string().max(255).default(""),
  emno: Joi.string().max(255).default(""),
  emergency_relation: Joi.string().max(250).default(""),
  emergency_contact_name: Joi.string().max(250).default(""),
  city: Joi.string().max(255).default(""),
  pincode: Joi.string().max(255).default(""),
  state1: Joi.string().max(255).default(""),
  city1: Joi.string().max(255).default(""),
  pincode1: Joi.string().max(255).default(""),
  cdesig: Joi.string().max(255).default(""),
  cctc: Joi.string().max(255).default(""),
  cname: Joi.string().max(100).default(""),
  doj: Joi.string().max(255).default(""),
  lwd: Joi.string().max(255).default(""),
  remanager: Joi.string().max(255).default(""),
  mano: Joi.string().max(255).default(""),
  refname: Joi.string().max(255).default(""),
  refno: Joi.string().max(255).default(""),
  ref_email: Joi.string().email().max(255).default(""),
  ref_1_num: Joi.string().max(255).default(""),
  ref_1_name: Joi.string().max(255).default(""),
  accno: Joi.string().max(255).default(""),
  bname: Joi.string().max(255).default(""),
  ifsc: Joi.string().max(255).default(""),
  aadharb: Joi.string().max(255).default(""),
  offer_letter: Joi.string().max(250).default(""),
  ns: Joi.string().max(255).default("Yes"),
  official_mail: Joi.string().email().max(255).default(""),
  department: Joi.string().max(255).default(""),
  company_name: Joi.string().max(250).default(""),
  reporting_manager: Joi.string().max(250).default(""),
  branch: Joi.string().max(250).default(""),
  band: Joi.string().max(250).default(""),
  office_add: Joi.string().max(250).default(""),
  tc_agree: Joi.string().max(255).default(""),
  gender: Joi.string().valid("male", "female", "other").max(255).default(""),
  marital_status: Joi.string()
    .valid("single", "married", "divorced", "widowed")
    .max(255)
    .default(""),
  mobile_uid: Joi.string().max(250).default(""),
  onboarding_hr: Joi.string().max(250).default(""),
  updates_status: Joi.number().integer().default(0),
  fresher_exp: Joi.string().max(50).default(""),
  total_work_exp: Joi.string().max(250).default(""),
  source: Joi.string().max(250).default(""),
  report: Joi.number().integer().default(0),
  user_type: Joi.string().max(250).default(""),
  active_inactive_status: Joi.string()
    .valid("active", "inactive")
    .max(25)
    .default("active"),
  mobile_app_level: Joi.string().max(10).default(""),
  metropolitan: Joi.string().max(250).default(""),
  pf_gratuity_applicable: Joi.number().integer().default(0),
  uan_num: Joi.string().max(250).default(""),
  pf_number: Joi.string().max(250).default(""),
  admin_type: Joi.string().max(250).default(""),
  admin_access: Joi.string().max(250).default(""),
  sub_menu_access: Joi.string().max(200).default(""),
  official_letters_pages: Joi.string().max(100).default(""),
  candidate_Id: Joi.string().max(250).default(""),
  shift_timing: Joi.number().integer().default(0),
  last_promotion_date: Joi.date().default(new Date()),
  biometric_id: Joi.string().max(10).default("0"),
  is_saturday_working: Joi.string().valid("YES", "NO").max(10).default("YES"),
  ERA: Joi.string().max(255).default(""),
});

// Simplified validation schema for essential fields only
const essentialEmployeeSchema = Joi.object({
  salutation: Joi.string().max(50).required(),
  ename: Joi.string().min(2).max(255).required(),
  usercode: Joi.string().max(255).required(),
  email: Joi.string().email().max(255).required(),
  mno: Joi.string().max(11).required(),
  department: Joi.string().max(255).optional(),
  post: Joi.string().max(255).optional(),
  joindate: Joi.date().optional(),
  salary: Joi.string().max(255).optional(),
  emp_code: Joi.string().max(255).optional(),
  active_inactive_status: Joi.string()
    .valid("active", "inactive")
    .default("active"),
  gender: Joi.string().valid("male", "female", "other").optional(),
  company_name: Joi.string().max(250).optional(),
  reporting_manager: Joi.string().max(250).optional(),
  branch: Joi.string().max(250).optional(),
});

// Login validation schema
const loginSchema = Joi.object({
  usercode: Joi.string().min(1).max(255).required(),
  password: Joi.string().min(1).max(255).required(),
  user_type: Joi.string().max(250).required(),
  fcm_token: Joi.string().max(500).optional(),
});

// Validation function for employee data
const validateEmployee = (data, requireRequired = true) => {
  // Use essential schema for easier validation
  let schema = requireRequired ? essentialEmployeeSchema : employeeSchema;

  // For updates, make all fields optional
  if (!requireRequired) {
    const schemaKeys = {};
    Object.keys(employeeSchema.describe().keys).forEach((key) => {
      schemaKeys[key] = employeeSchema.extract(key).optional();
    });
    schema = Joi.object(schemaKeys);
  }

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
      value: detail.context?.value,
    }));

    return {
      isValid: false,
      errors,
      data: null,
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value,
  };
};

// Validation function for login data
const validateLogin = (data) => {
  const { error, value } = loginSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
      value: detail.context?.value,
    }));

    return {
      isValid: false,
      errors,
      data: null,
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value,
  };
};

// Query validation for pagination and search
const validateQuery = (query) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().max(100).optional(),
    department: Joi.string().max(255).optional(),
    status: Joi.string().valid("active", "inactive", "all").default("all"),
    sortBy: Joi.string()
      .valid("emp_id", "ename", "email", "department", "joindate")
      .default("emp_id"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  });

  const { error, value } = schema.validate(query);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map((detail) => detail.message),
      data: null,
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value,
  };
};

module.exports = {
  validateEmployee,
  validateLogin,
  validateQuery,
  employeeSchema,
  essentialEmployeeSchema,
  loginSchema,
};
