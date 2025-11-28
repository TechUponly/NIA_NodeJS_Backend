const { pool } = require("../config/database");

class AuthService {
  /**
   * Authenticate user with usercode, password and user_type
   * @param {string} usercode - User code
   * @param {string} password - User password
   * @param {string} userType - User type
   * @returns {Object|null} - User data or null if not found
   */
  async authenticateUser(usercode, password, userType) {
    try {
      const employeeQuery = `
        SELECT *, 
               getReportingNameByEmpID(emp_id) as reporting_manager,
               getBranchByEmpID(emp_id) as branch_location 
        FROM employee 
        WHERE usercode = ? AND password = ? AND user_type = ?
      `;

      const [employeeRows] = await pool.execute(employeeQuery, [
        usercode,
        password,
        userType,
      ]);

      if (employeeRows.length === 0) {
        return null;
      }

      return employeeRows[0];
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get team access levels for user
   * @returns {Array} - Array of team access level IDs as strings
   */
  async getTeamAccessLevels() {
    try {
      const teamAccessQuery = `
        SELECT id 
        FROM mobile_app_level 
        WHERE (description LIKE '%Team%' OR description = 'By default all day present(Not Active)')
      `;

      const [teamAccessRows] = await pool.execute(teamAccessQuery);
      return teamAccessRows.map((row) => parseInt(row.id));
    } catch (error) {
      throw new Error(`Failed to get team access levels: ${error.message}`);
    }
  }

  /**
   * Update FCM token for user
   * @param {number} empId - Employee ID
   * @param {string} fcmToken - FCM token
   * @returns {boolean} - Success status
   */
  async updateFCMToken(empId, fcmToken) {
    try {
      await pool.execute(
        "UPDATE employee SET mobile_uid = ? WHERE emp_id = ?",
        [fcmToken, empId]
      );
      return true;
    } catch (error) {
      console.warn("Failed to update FCM token:", error.message);
      return false;
    }
  }

  /**
   * Clear FCM token for user (logout)
   * @param {number} empId - Employee ID
   * @returns {boolean} - Success status
   */
  async clearFCMToken(empId) {
    try {
      await pool.execute(
        "UPDATE employee SET mobile_uid = ? WHERE emp_id = ?",
        ["", empId]
      );
      return true;
    } catch (error) {
      console.warn("Failed to clear FCM token:", error.message);
      return false;
    }
  }

  /**
   * Get user profile by employee ID
   * @param {number} empId - Employee ID
   * @returns {Object|null} - User profile or null if not found
   */
  async getUserProfile(empId) {
    try {
      const profileQuery = `
        SELECT *, 
               getReportingNameByEmpID(emp_id) as reporting_manager,
               getBranchByEmpID(emp_id) as branch_location 
        FROM employee 
        WHERE emp_id = ?
      `;

      const [rows] = await pool.execute(profileQuery, [empId]);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Validate user session by empId or usercode
   * @param {number|string} identifier - Employee ID or usercode
   * @param {string} type - 'empId' or 'usercode'
   * @returns {Object|null} - User session data or null if not found
   */
  async validateUserSession(identifier, type = "empId") {
    try {
      let query =
        "SELECT emp_id, ename, usercode, active_inactive_status FROM employee WHERE ";
      let params = [identifier];

      if (type === "empId") {
        query += "emp_id = ?";
      } else {
        query += "usercode = ?";
      }

      const [rows] = await pool.execute(query, params);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      throw new Error(`Failed to validate user session: ${error.message}`);
    }
  }

  /**
   * Format user data for PHP-compatible response
   * @param {Object} employee - Employee data from database
   * @param {Array} teamAccess - Team access levels
   * @returns {Object} - Formatted response object
   */
  formatUserResponse(employee, teamAccess = []) {
    return {
      status: "found",
      emp_id: employee.emp_id.toString(),
      emp_code: employee.emp_code || "",
      ename: employee.ename || "",
      usercode: employee.usercode || "",
      descri: employee.descri || "",
      post: employee.post || "",
      joindate: employee.joindate || "",
      mno: employee.mno || "",
      official_mail: employee.official_mail || "",
      personal_mail: employee.email || "",
      address: employee.address || "",
      bgrp: employee.bgrp || "",
      state: employee.state || "",
      city: employee.city || "",
      profileimg: employee.passphoto || "", // Using passphoto as profileimg
      gender: employee.gender || "",
      mobile_app_level: employee.mobile_app_level || "",
      user_type: employee.user_type || "",
      admin_type: employee.admin_type || "",
      marital_status: employee.marital_status || "",
      aadhar: employee.aadhar || "",
      remanager: employee.reporting_manager || "N/A",
      team_access: teamAccess.map((id) => id.toString()),
      dob: employee.dob || "",
      department: employee.department || "",
      company_name: employee.company_name || "",
      branch_code: employee.branch_location || "",
      hr_policies_check: employee.hr_policies_check,
    };
  }

  /**
   * Complete login process
   * @param {string} usercode - User code
   * @param {string} password - User password
   * @param {string} userType - User type
   * @param {string} fcmToken - FCM token (optional)
   * @returns {Object|null} - Login response or null if failed
   */
  async processLogin(usercode, password, userType, fcmToken = null) {
    try {
      // Authenticate user
      const employee = await this.authenticateUser(
        usercode,
        password,
        userType
      );

      if (!employee) {
        return null;
      }

      // Get team access levels
      const teamAccess = await this.getTeamAccessLevels();

      // Update FCM token if provided
      if (fcmToken) {
        await this.updateFCMToken(employee.emp_id, fcmToken);
      }

      // Format and return response
      return this.formatUserResponse(employee, teamAccess);
    } catch (error) {
      throw new Error(`Login process failed: ${error.message}`);
    }
  }

  /**
   * Complete profile retrieval process
   * @param {number} empId - Employee ID
   * @returns {Object|null} - Profile response or null if not found
   */
  async processGetProfile(empId) {
    try {
      // Get user profile
      const employee = await this.getUserProfile(empId);

      if (!employee) {
        return null;
      }

      // Get team access levels
      const teamAccess = await this.getTeamAccessLevels();

      // Format and return response
      return this.formatUserResponse(employee, teamAccess);
    } catch (error) {
      throw new Error(`Get profile process failed: ${error.message}`);
    }
  }

  /**
   * Process user logout
   * @param {number} empId - Employee ID
   * @returns {boolean} - Success status
   */
  async processLogout(empId) {
    try {
      return await this.clearFCMToken(empId);
    } catch (error) {
      throw new Error(`Logout process failed: ${error.message}`);
    }
  }

  /**
   * Process session validation
   * @param {number|string} identifier - Employee ID or usercode
   * @param {string} type - 'empId' or 'usercode'
   * @returns {Object|null} - Session validation response
   */
  async processSessionValidation(identifier, type = "empId") {
    try {
      const employee = await this.validateUserSession(identifier, type);

      if (!employee) {
        return { status: "not found" };
      }

      if (employee.active_inactive_status !== "active") {
        return { status: "inactive" };
      }

      return {
        status: "found",
        emp_id: employee.emp_id.toString(),
        ename: employee.ename,
        usercode: employee.usercode,
        active_status: employee.active_inactive_status,
      };
    } catch (error) {
      throw new Error(`Session validation failed: ${error.message}`);
    }
  }
}

module.exports = new AuthService();
