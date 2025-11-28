const { pool } = require("../config/database");

class AdminAccessService {
  /**
   * Get employee admin details by usercode
   * @param {string} usercode - Employee user code
   * @returns {Object|null} - Employee admin data or null if not found
   */
  async getEmployeeAdminDetails(usercode) {
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM employee WHERE usercode = ?",
        [usercode]
      );

      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error(
        `Error fetching employee admin details: ${error.message}`
      );
    }
  }

  /**
   * Get admin pages based on admin type and access permissions
   * @param {string} adminType - Admin type (1, 2, or other)
   * @param {string} adminAccess - Admin access permissions (comma-separated IDs)
   * @returns {Array} - Array of admin pages
   */
  async getAdminPages(adminType, adminAccess) {
    try {
      let query;
      let params = [];

      if (adminType == 1) {
        // Super admin - all active pages
        query =
          "SELECT * FROM admin_pages WHERE status = 'Active' ORDER BY admin_main_menu";
      } else if (adminType == 2) {
        // Regular admin - specific pages based on admin_access
        query = `SELECT * FROM admin_pages WHERE id IN (${adminAccess}) AND status = 'Active' ORDER BY admin_main_menu`;
      } else {
        // No admin access
        query =
          "SELECT * FROM admin_pages WHERE id IN (0) AND status = 'Active' ORDER BY admin_main_menu";
      }

      const [rows] = await pool.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error fetching admin pages: ${error.message}`);
    }
  }

  /**
   * Get admin internal pages for given main page IDs
   * @param {Array} adminRoutesId - Array of main page IDs
   * @returns {Array} - Array of internal page routes
   */
  async getAdminInternalPages(adminRoutesId) {
    try {
      if (!adminRoutesId || adminRoutesId.length === 0) {
        return [];
      }

      // Safe integer conversion and filtering
      const safeIds = adminRoutesId
        .filter((id) => id && !isNaN(parseInt(id)))
        .map((id) => parseInt(id));

      if (safeIds.length === 0) {
        return [];
      }

      const placeholders = safeIds.map(() => "?").join(", ");
      const query = `SELECT * FROM admin_internalpages WHERE main_page_id IN (${placeholders})`;

      const [rows] = await pool.execute(query, safeIds);
      return rows.map((row) => row.on_click_name);
    } catch (error) {
      throw new Error(`Error fetching admin internal pages: ${error.message}`);
    }
  }

  /**
   * Group admin pages by main menu
   * @param {Array} adminPagesData - Raw admin pages data from database
   * @returns {Object} - Object with grouped admin pages and routes
   */
  groupAdminPagesByMenu(adminPagesData) {
    const adminPages = {};
    const adminRoutes = [];
    const adminRoutesId = [];
    let currentMenu = null;

    adminPagesData.forEach((row) => {
      if (currentMenu !== row.admin_main_menu) {
        currentMenu = row.admin_main_menu;
        adminPages[currentMenu] = [];
      }

      adminPages[currentMenu].push({
        id: row.id,
        pages: row.pages,
        on_click_name: row.on_click_name,
        is_dropdown: row.is_dropdown,
        icons: row.icon,
      });

      adminRoutes.push(row.on_click_name);
      adminRoutesId.push(row.id);
    });

    return {
      adminPages,
      adminRoutes,
      adminRoutesId,
    };
  }

  /**
   * Process admin access request for an employee
   * @param {string} empId - Employee user code
   * @returns {Object} - Admin access response matching PHP format
   */
  async processAdminAccessRequest(empId) {
    try {
      // Get employee admin details
      const employee = await this.getEmployeeAdminDetails(empId);

      if (!employee) {
        return { status: "not found" };
      }

      const {
        emp_code,
        admin_type,
        admin_access,
        sub_menu_access: submenupages,
        official_letters_pages: officialLettersIdName,
      } = employee;

      // Handle admin_access - if empty, set to 0
      const adminAccess = admin_access || "0";

      // Get admin pages based on admin type
      const adminPagesData = await this.getAdminPages(admin_type, adminAccess);

      // Group pages by menu and extract routes
      const { adminPages, adminRoutes, adminRoutesId } =
        this.groupAdminPagesByMenu(adminPagesData);

      // Get admin internal pages
      const adminInternalpagesRoutes = await this.getAdminInternalPages(
        adminRoutesId
      );

      // Format response to match PHP structure exactly
      return {
        status: "Success",
        emp_code: emp_code,
        admin_type: admin_type,
        submenupages: [submenupages || ""],
        officialLettersId: [officialLettersIdName || ""],
        admin_pages: [adminPages],
        admin_routes: adminRoutes,
        admin_internalpages_routes: adminInternalpagesRoutes,
      };
    } catch (error) {
      throw new Error(`Admin access request failed: ${error.message}`);
    }
  }
}

module.exports = new AdminAccessService();
