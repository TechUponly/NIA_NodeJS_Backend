const orgService = require("../services/organizationService");

const handleOrgRequest = async (req, res) => {
  try {
    const { type } = req.query;
    const clean = (val) => val ? String(val).replace(/[#'";]/g, '') : null;

    if (!type) return res.status(400).json({ status: 'error', message: 'Missing type parameter' });

    // --- DEPARTMENTS ---
    
    if (type === 'add_department') {
      const org = clean(req.query.org_name);
      const dept = clean(req.query.department_name);
      if (!org || !dept) return res.status(400).json({ status: 'error', message: 'Missing parameters' });

      const existing = await orgService.getDepartment(org, dept);
      if (existing) return res.status(409).json({ status: 'error', message: 'Department already exists' });

      await orgService.addDepartment(org, dept);
      return res.status(200).json({ status: 'success', message: 'Department added successfully' });
    }

    if (type === 'fetch_all_department') {
      const depts = await orgService.getAllDepartments();
      return res.status(200).json({ status: 'success', message: 'Fetched successfully', data: depts });
    }

    if (type === 'delete_department') {
      const id = req.query.department_id;
      const name = clean(req.query.department_name);
      if (!id && !name) return res.status(400).json({ status: 'error', message: 'Missing ID or Name' });

      const result = await orgService.deleteDepartment(id, name);
      if (!result) return res.status(404).json({ status: 'error', message: 'Department not found' });
      return res.status(200).json({ status: 'success', message: 'Department deleted successfully' });
    }

    // --- DESIGNATIONS ---

    if (type === 'add_designation') {
      const dept = clean(req.query.department);
      const desig = clean(req.query.designation_name);
      if (!dept || !desig) return res.status(400).json({ status: 'error', message: 'Missing parameters' });

      const existing = await orgService.getDesignation(dept, desig);
      if (existing) return res.status(409).json({ status: 'error', message: 'Designation already exists' });

      await orgService.addDesignation(dept, desig);
      return res.status(200).json({ status: 'success', message: 'Designation added successfully' });
    }

    if (type === 'fetch_designation') {
      const desigs = await orgService.getAllDesignations();
      return res.status(200).json({ status: 'success', message: 'Fetched successfully', data: desigs });
    }

    if (type === 'delete_designation') {
      const id = req.query.designation_id;
      const name = clean(req.query.designation_name);
      const dept = clean(req.query.department);
      if (!id && (!name || !dept)) return res.status(400).json({ status: 'error', message: 'Missing required params' });

      const result = await orgService.deleteDesignation(id, name, dept);
      if (!result) return res.status(404).json({ status: 'error', message: 'Designation not found' });
      return res.status(200).json({ status: 'success', message: 'Designation deleted successfully' });
    }

    // --- BANDS ---

    if (type === 'fetch_all') { // Fetch bands with details
      const bands = await orgService.getAllBands();
      return res.status(200).json({ status: 'success', message: 'Fetched successfully', data: bands });
    }

    if (type === 'fetch_band') { // Fetch simple list
      const bands = await orgService.getBandListOnly();
      return res.status(200).json({ status: 'success', message: 'Fetched successfully', data: bands });
    }

    if (type === 'add_band_probationaryPeriod') {
      const data = {
        designation: clean(req.query.designationInput),
        band: clean(req.query.band),
        prob_period: clean(req.query.probationary_period),
        notice_period: clean(req.query.notice_period)
      };
      if (!data.designation || !data.band) return res.status(400).json({ status: 'error', message: 'Missing params' });

      const result = await orgService.addOrUpdateBand(data);
      let msg = "";
      if (result.action === 'inserted') msg = "Record Added Successfully";
      else if (result.action === 'updated') msg = "Record Updated Successfully";
      else msg = "Record Already Exists";

      return res.status(200).json({ status: 'success', message: msg, data: result.data });
    }

    return res.status(400).json({ status: 'error', message: 'Invalid Type' });

  } catch (error) {
    console.error("Org Controller Error:", error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = { handleOrgRequest };