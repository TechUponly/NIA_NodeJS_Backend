const { pool } = require("../config/database");

class HRPolicyService {
  /**
   * Get HR policies from database
   * @returns {Object} - Policies object with ID as key and name as value
   */
  async getHRPolicies() {
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM hrpolicy WHERE status <> 0"
      );

      const policies = {};
      rows.forEach((row) => {
        policies[row.id] = row.Policy_Name;
      });

      return policies;
    } catch (error) {
      throw new Error(`Error fetching HR policies: ${error.message}`);
    }
  }

  /**
   * Get HR policy concerns for an employee
   * @param {string} empId - Employee user code
   * @returns {Object|null} - Policy concern data or null if not found
   */
  async getEmployeePolicyConcerns(empId) {
    try {
      // First get all policies
      const policies = await this.getHRPolicies();

      // Build dynamic SQL query
      let sqlQuery = "SELECT usercode, ename AS Name";

      // Add each policy as a column
      for (const [policyID, policyName] of Object.entries(policies)) {
        sqlQuery += `, CASE WHEN (SELECT COUNT(*) FROM hrpolicyconcerns h WHERE employeeID = emp_id AND PolicyID = ${policyID}) > 0 THEN 'Yes' ELSE 'No' END AS \`${policyName}\``;
      }

      // Add overall adherence calculation
      let overallAdherenceQuery = " CASE WHEN ";
      for (const [policyID] of Object.entries(policies)) {
        overallAdherenceQuery += `(SELECT COUNT(*) FROM hrpolicyconcerns h WHERE employeeID = emp_id AND PolicyID = ${policyID}) > 0 AND `;
      }
      overallAdherenceQuery +=
        "1=1 THEN 'Yes' ELSE 'No' END AS 'Overall_Adherence'";
      sqlQuery += `, ${overallAdherenceQuery}`;

      // Add WHERE clause
      sqlQuery += ` FROM employee WHERE usercode = ? AND post NOT LIKE '%Variable%'`;

      const [rows] = await pool.execute(sqlQuery, [empId]);

      return rows.length > 0 ? rows : null;
    } catch (error) {
      throw new Error(`Error fetching policy concerns: ${error.message}`);
    }
  }

  /**
   * Process HR policy concern request
   * @param {string} empId - Employee user code
   * @returns {Object} - Response object matching PHP format
   */
  async processPolicyConcernRequest(empId) {
    try {
      const result = await this.getEmployeePolicyConcerns(empId);

      if (result && result.length > 0) {
        return {
          status: true,
          message: "Data Found",
          data: result,
        };
      } else {
        return {
          status: false,
          message: "No Data Found",
        };
      }
    } catch (error) {
      throw new Error(`Policy concern request failed: ${error.message}`);
    }
  }
}

module.exports = new HRPolicyService();
