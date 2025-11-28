const adminAccessService = require("../services/adminAccessService");

class AdminAccessController {
  /**
   * Get admin access pages for employee
   */
  async getAdminAccessPages(req, res) {
    try {
      const { emp_id } = req.query;

      if (!emp_id) {
        return res.status(400).json({
          status: "error",
          message: "Employee ID is required",
        });
      }

      // Process the request through service
      const result = await adminAccessService.processAdminAccessRequest(emp_id);

      if (result.status === "Success") {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      console.error("Error in getAdminAccessPages:", error);
      return res.status(500).json({
        status: "error",
        message: "Internal server error",
      });
    }
  }
}

module.exports = new AdminAccessController();
