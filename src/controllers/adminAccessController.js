const adminAccessService = require("../services/adminAccessService");

const getAdminAccessPages = async (req, res, next) => {
  try {
    const { emp_id } = req.query;

    if (!emp_id) {
      return res.status(200).json({ status: "not found" });
    }

    const employee = await adminAccessService.getEmployeeByCode(emp_id);

    if (employee) {
      const emp_code = employee.emp_code;
      const admin_type = employee.admin_type;
      let admin_access = employee.admin_access || '0';
      const submenupages = employee.sub_menu_access || "";
      const officialLettersIdName = employee.official_letters_pages || "";

      const adminPagesRows = await adminAccessService.getAdminPages(admin_type, admin_access);

      // --- GROUPING LOGIC ---
      const groupedPages = {};
      const admin_routes = [];
      const admin_routes_id = [];

      adminPagesRows.forEach((row) => {
        const current_menu = row.admin_main_menu;

        if (!groupedPages[current_menu]) {
          groupedPages[current_menu] = [];
        }

        groupedPages[current_menu].push({
          id: String(row.id),
          pages: row.pages,
          on_click_name: row.on_click_name,
          is_dropdown: String(row.is_dropdown),
          icons: row.icon
        });

        admin_routes.push(row.on_click_name);
        admin_routes_id.push(row.id);
      });

      // Internal Pages Logic
      let admin_internalpages_routes = [];
      const validIds = admin_routes_id.filter(id => id).map(id => parseInt(id));

      if (validIds.length > 0) {
        const internalRows = await adminAccessService.getInternalPages(validIds);
        admin_internalpages_routes = internalRows.map(row => row.on_click_name);
      }

      // --- FINAL RESPONSE STRUCTURE ---
      const response = {
        status: "Success",
        emp_code: emp_code,
        admin_type: String(admin_type),
        submenupages: [submenupages],
        officialLettersId: [String(officialLettersIdName)],
        admin_pages: [groupedPages],
        admin_routes: admin_routes,
        admin_internalpages_routes: admin_internalpages_routes
      };

      res.status(200).json(response);

    } else {
      res.status(200).json({ status: "not found" });
    }

  } catch (error) {
    console.error("Error in getAdminAccessPages:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

module.exports = {
  getAdminAccessPages
};