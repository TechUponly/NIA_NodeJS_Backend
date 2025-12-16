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
// ... (keep all your existing code above)

  /**
   * ============================================
   * BYPASS LOGIN METHODS (WEB AUTHENTICATION)
   * ============================================
   */

  /**
   * Find employee by usercode (without password check)
   * @param {string} usercode - Employee usercode
   * @returns {object|null} Employee data or null
   */
  async findEmployeeByUsercodeOnly(usercode) {
    try {
      const employeeQuery = `
        SELECT *, 
               getReportingNameByEmpID(emp_id) as reporting_manager,
               getBranchByEmpID(emp_id) as branch_location 
        FROM employee 
        WHERE usercode = ?
      `;

      const [employeeRows] = await pool.execute(employeeQuery, [usercode]);

      if (employeeRows.length === 0) {
        return null;
      }

      return employeeRows[0];
    } catch (error) {
      throw new Error(`Failed to find employee: ${error.message}`);
    }
  }

  /**
   * Update or create FCM token in fcm_token table
   * @param {object} data - FCM token data
   * @returns {boolean} Success status
   */
  async upsertFCMTokenTable(data) {
    const { emp_id, emp_code, fcm_token, device_id } = data;

    try {
      // Check if token exists
      const [existingTokens] = await pool.execute(
        'SELECT * FROM fcm_token WHERE emp_id = ?',
        [emp_id]
      );

      if (existingTokens && existingTokens.length > 0) {
        // Update existing token
        await pool.execute(
          'UPDATE fcm_token SET token = ?, device_id = ?, updated_at = NOW() WHERE emp_id = ?',
          [fcm_token, device_id, emp_id]
        );
        console.log('🔄 FCM token updated in fcm_token table for emp_id:', emp_id);
      } else {
        // Insert new token
        await pool.execute(
          'INSERT INTO fcm_token (emp_id, emp_code, token, device_id, created_at) VALUES (?, ?, ?, ?, NOW())',
          [emp_id, emp_code, fcm_token, device_id]
        );
        console.log('✨ New FCM token created in fcm_token table for emp_id:', emp_id);
      }

      return true;
    } catch (error) {
      console.error('Error upserting FCM token:', error);
      throw error;
    }
  }

  /**
   * Log user login in login_logs table
   * @param {object} data - Login data
   * @returns {boolean} Success status
   */
  async logUserLoginActivity(data) {
    const { emp_id, emp_code, login_type, ip_address, user_agent } = data;

    try {
      await pool.execute(
        'INSERT INTO login_logs (emp_id, emp_code, login_type, ip_address, user_agent, login_time) VALUES (?, ?, ?, ?, ?, NOW())',
        [emp_id, emp_code, login_type, ip_address, user_agent]
      );
      console.log('📝 Login logged for emp_id:', emp_id);
      return true;
    } catch (error) {
      console.error('Error logging login:', error);
      // Don't throw - logging failure shouldn't break login
      return false;
    }
  }

  /**
   * Format employee response for bypass login (PHP compatible)
   * @param {object} employee - Employee data from database
   * @param {string} user_type - User type
   * @param {string} jwtToken - JWT token
   * @returns {object} Formatted employee data
   */
  formatBypassLoginResponse(employee, user_type = 'employee', jwtToken) {
    return {
      status: 'found',
      emp_id: employee.emp_id,
      emp_code: employee.emp_code || employee.usercode,
      ename: employee.ename || '',
      usercode: employee.usercode || '',
      descri: employee.descri || '',
      post: employee.post || '',
      joindate: employee.joindate || '',
      mno: employee.mno || '',
      official_mail: employee.official_mail || employee.email || '',
      address: employee.address || '',
      bgrp: employee.bgrp || '',
      state: employee.state || '',
      Branch: employee.city || employee.branch_location || '',
      profileimg: employee.passphoto || '',
      gender: employee.gender || '',
      mobile_app_level: employee.mobile_app_level || '',
      user_type: user_type,
      zoom_link: employee.zoom_link || '',
      channel: employee.channel || '',
      token: jwtToken,
      active_hrms: ['9'],
      admin_portal: employee.admin_portal || '',
      department: employee.department || '',
      company_name: employee.company_name || '',
      reporting_manager: employee.reporting_manager || 'N/A'
    };
  }

  /**
   * Process bypass login (without password validation)
   * @param {string} usercode - User code
   * @param {string} user_type - User type
   * @param {string} fcm_token - FCM token
   * @param {string} device_id - Device ID
   * @param {string} ip_address - IP address
   * @param {string} user_agent - User agent
   * @returns {object|null} Bypass login response or null if failed
   */
  async processBypassLogin(usercode, user_type, fcm_token, device_id, ip_address, user_agent) {
    try {
      // Find employee by usercode only (no password check)
      const employee = await this.findEmployeeByUsercodeOnly(usercode);

      if (!employee) {
        console.log('❌ Employee not found for bypass login:', usercode);
        return null;
      }

      console.log('✅ Employee found for bypass login:', employee.ename);

      // Generate JWT token
      const tokenHandler = require('../utils/jwtHandler');
      const jwtToken = tokenHandler.generateToken(employee.emp_code || employee.usercode);

      // Update/Create FCM token in fcm_token table
      await this.upsertFCMTokenTable({
        emp_id: employee.emp_id,
        emp_code: employee.emp_code || employee.usercode,
        fcm_token,
        device_id
      });

      // Log the login activity (non-blocking)
      this.logUserLoginActivity({
        emp_id: employee.emp_id,
        emp_code: employee.emp_code || employee.usercode,
        login_type: 'web_bypass',
        ip_address,
        user_agent
      }).catch(err => console.error('Login logging failed:', err));

      // Format and return response
      return this.formatBypassLoginResponse(employee, user_type, jwtToken);
    } catch (error) {
      throw new Error(`Bypass login process failed: ${error.message}`);
    }
  }

  /**
   * Process validate user (for query param authentication)
   * @param {string} userId - User ID
   * @param {string} type - Authentication type
   * @param {string} fcm_token - FCM token
   * @param {string} ip_address - IP address
   * @param {string} user_agent - User agent
   * @returns {object|null} Validation response or null if failed
   */
  async processValidateUser(userId, type, fcm_token, ip_address, user_agent) {
    try {
      // Find employee
      const employee = await this.findEmployeeByUsercodeOnly(userId);

      if (!employee) {
        return null;
      }

      // Update FCM token if provided and valid
      if (fcm_token && fcm_token !== 'no_token' && fcm_token !== 'abc') {
        await this.upsertFCMTokenTable({
          emp_id: employee.emp_id,
          emp_code: employee.emp_code || employee.usercode,
          fcm_token,
          device_id: 'web_query_param'
        });
      }

      // Log the login activity (non-blocking)
      this.logUserLoginActivity({
        emp_id: employee.emp_id,
        emp_code: employee.emp_code || employee.usercode,
        login_type: type,
        ip_address,
        user_agent
      }).catch(err => console.error('Login logging failed:', err));

      // Return formatted response
      return {
        success: true,
        usercode: employee.usercode,
        admin_type: employee.mobile_app_level || employee.admin_type || '0',
        username: employee.ename,
        email: employee.email || employee.official_mail,
        official_mail: employee.official_mail,
        emp_id: employee.emp_id,
        emp_code: employee.emp_code || employee.usercode,
        post: employee.post,
        descri: employee.descri,
        department: employee.department,
        message: 'User validated successfully',
      };
    } catch (error) {
      throw new Error(`User validation failed: ${error.message}`);
    }
  }

}

module.exports = new AuthService();
