const hrPolicyService = require("../services/hrPolicyService");

class HRPolicyController {
  /**
   * Get HR policy concerns for employee
   */
  async getPolicyConcerns(req, res) {
    try {
      const { empId } = req.body;

      if (!empId) {
        return res.status(400).json({
          status: false,
          message: "Employee ID is required",
        });
      }

      // Process the request through service
      const result = await hrPolicyService.processPolicyConcernRequest(empId);

      if (result.status) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      console.error("Error in getPolicyConcerns:", error);
      return res.status(500).json({
        status: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new HRPolicyController();
