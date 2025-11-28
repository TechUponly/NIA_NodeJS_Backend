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
}

module.exports = new AuthController();
