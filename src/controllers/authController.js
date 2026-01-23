const { errorResponse } = require("../utils/responseHelper");
const { validateLogin } = require("../utils/validators");
const authService = require("../services/authService");

class AuthController {
  /**
   * User login endpoint
   */
  async login(req, res) {
    try {
      const { t1, t2, user_type, fcm_token } = req.query;

      // Map PHP parameter names to internal names
      const usercode = t1;
      const password = t2;

      // Validate required parameters
      const validation = validateLogin({ usercode, password, user_type });
      if (!validation.isValid) {
        return errorResponse(res, 400, "Validation failed", validation.errors);
      }

      // Process login through service
      const loginResult = await authService.processLogin(
        usercode,
        password,
        user_type,
        fcm_token
      );

      if (!loginResult) {
        return res.status(200).json({ status: "not found" });
      }

      return res.status(200).json(loginResult);
    } catch (error) {
      console.error("Error in login:", error);
      return errorResponse(res, 500, "Internal server error", error.message);
    }
  }

  /**
   * Get user profile endpoint
   */
  async getProfile(req, res) {
    try {
      const { empId } = req.params;

      if (!empId || isNaN(empId)) {
        return errorResponse(res, 400, "Invalid employee ID");
      }

      // Get profile through service
      const profileResult = await authService.processGetProfile(
        parseInt(empId)
      );

      if (!profileResult) {
        return res.status(200).json({ status: "not found" });
      }

      return res.status(200).json(profileResult);
    } catch (error) {
      console.error("Error in getProfile:", error);
      return errorResponse(res, 500, "Internal server error", error.message);
    }
  }

  /**
   * User logout endpoint
   */
  async logout(req, res) {
    try {
      const { empId } = req.body;

      if (!empId) {
        return errorResponse(res, 400, "Employee ID is required");
      }

      // Process logout through service
      const logoutResult = await authService.processLogout(empId);

      if (logoutResult) {
        return res
          .status(200)
          .json({ status: "success", message: "Logout successful" });
      } else {
        return errorResponse(res, 500, "Logout failed");
      }
    } catch (error) {
      console.error("Error in logout:", error);
      return errorResponse(res, 500, "Internal server error", error.message);
    }
  }

  /**
   * Validate user session endpoint
   */
  async validateSession(req, res) {
    try {
      const { empId, usercode } = req.query;

      if (!empId && !usercode) {
        return errorResponse(res, 400, "Employee ID or usercode required");
      }

      // Determine validation type and identifier
      const identifier = empId || usercode;
      const type = empId ? "empId" : "usercode";

      // Process session validation through service
      const validationResult = await authService.processSessionValidation(
        identifier,
        type
      );

      return res.status(200).json(validationResult);
    } catch (error) {
      console.error("Error in validateSession:", error);
      return errorResponse(res, 500, "Internal server error", error.message);
    }
  }

  async bypassLogin(req, res) {
    try {
      // Extract and sanitize input
      const {
        t1: usercode = '',
        t2: password = '',
        user_type = 'employee',
        fcm_token = 'abc',
        device_id = '123'
      } = req.body;

      console.log('🔐 Bypass login attempt for user:', usercode);

      // Validate required fields
      if (!usercode) {
        return res.status(400).json({
          status: 'error',
          message: 'User code (t1) is required'
        });
      }

      // Get IP address and user agent
      const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
      const user_agent = req.get('user-agent') || 'unknown';

      // Process bypass login through service
      const loginResult = await authService.processBypassLogin(
        usercode,
        user_type,
        fcm_token,
        device_id,
        ip_address,
        user_agent
      );

      if (!loginResult) {
        console.log('❌ Bypass login failed: User not found');
        return res.json({
          status: 'not found',
          message: 'Employee not found'
        });
      }

      console.log('✅ Bypass login successful for:', loginResult.ename);
      return res.json(loginResult);

    } catch (error) {
      console.error('❌ Bypass login error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Validate User Controller (Query Param Authentication)
   * @route POST /api/auth/validate-user
   * @description Validate user for query parameter authentication
   */
  async validateUser(req, res) {
    try {
      const { userId, type, fcm_token } = req.body;

      console.log('🔍 Validating user:', { userId, type, fcm_token });

      // Validate required fields
      if (!userId || !type) {
        return res.json({
          success: false,
          message: 'userId and type are required',
        });
      }

      // Get IP address and user agent
      const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
      const user_agent = req.get('user-agent') || 'unknown';

      // Process user validation through service
      const validationResult = await authService.processValidateUser(
        userId,
        type,
        fcm_token,
        ip_address,
        user_agent
      );

      if (!validationResult) {
        return res.json({
          success: false,
          message: 'User not found',
        });
      }

      console.log('✅ User validation successful for:', validationResult.username);
      return res.json(validationResult);

    } catch (error) {
      console.error('❌ User validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during validation',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
  /**
   * Login Bypass via GET request (Matches PHP behavior)
   */
  async loginBypassGet(req, res) {
    try {
      // Map PHP parameters: t1 -> usercode, user_type -> user_type, fcm_token -> fcm_token
      const { t1: usercode, user_type, fcm_token } = req.query;

      if (!usercode || !user_type) {
        return res
          .status(400)
          .json({ status: "error", message: "Missing required parameters" });
      }

      // Process login through service
      const loginResult = await authService.processLoginByUserType(
        usercode,
        user_type,
        fcm_token
      );

      if (!loginResult) {
        return res.status(200).json({ status: "not found" });
      }

      return res.status(200).json(loginResult);
    } catch (error) {
      console.error("Error in loginBypassGet:", error);
      return errorResponse(res, 500, "Internal server error", error.message);
    }
  }
}

module.exports = new AuthController();
