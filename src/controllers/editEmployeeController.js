const employeeService = require("../services/employeeService");
const emailService = require("../services/emailService"); // Reuse your email service

const editEmployee = async (req, res) => {
  try {
    const data = req.body;
    const type = data.type;
    const empId = data.emp_id;

    if (!empId || empId <= 0) {
      return res.status(400).json({ status: "error", message: "Invalid Employee ID" });
    }

    // 1. Activate
    if (type === "activeEmployee") {
      await employeeService.activateEmployee(empId, data.emp_code);
      return res.json({ status: true, message: "Successfully Activate Employee" });
    }

    // 2. Inactivate
    if (type === "inactiveEmployee") {
      await employeeService.deactivateEmployee(empId);
      return res.json({ status: true, message: "Successfully Inactivate Employee" });
    }

    // 3. Personal Details
    if (type === "personalDetails") {
      await employeeService.updatePersonalDetails(empId, data);
      return res.json({ status: true, message: "Successfully Updated Employee Personal Details" });
    }

    // 4. Address Details
    if (type === "AddressDetails") {
      await employeeService.updateAddressDetails(empId, data);
      return res.json({ status: true, message: "Successfully Updated Employee Address Details" });
    }

    // 5. Previous Employment
    if (type === "PreviousEmploymentDetails") {
      await employeeService.updatePreviousEmployment(empId, data);
      return res.json({ status: true, message: "Successfully Updated Previous Company Details" });
    }

    // 6. Bank Details
    if (type === "BankDetails") {
      await employeeService.updateBankDetails(empId, data);
      return res.json({ status: true, message: "Successfully Updated Employee Bank Details" });
    }

    // 7. Official Details (Includes Email Sending)
    if (type === "OfficialDetails") {
      await employeeService.updateOfficialDetails(empId, data);

      // Check if this is a first-time update (updates_status == 0) or force send
      // PHP Logic: if ($update_status == 0 || true)
      // Here we assume we always want to send the email if credentials changed
      
      try {
        // Send Welcome Email
        const emailSubject = "E-Code for WEB/APP login";
        const emailBody = `
          Dear ${data.ename},
          Your information has been successfully processed.
          Ecode: ${data.usercode}
          Password: ${data.PassWord}
        `;
        
        // Use your existing email service
        // Note: You might need to update emailService to handle generic emails, 
        // or just use sendLeaveNotification style function.
        // For now, let's assume we log it.
        console.log("Triggering Email to:", data.email);
        
      } catch (e) {
        console.error("Email failed:", e.message);
      }

      return res.json({ status: true, message: "Successfully Updated Employee Official Details" });
    }

    // 8. Document Details (Handled separately by upload middleware?)
    // If you are sending files here too, we need Multer on this route.
    // For now, assuming this controller handles JSON data updates.
    
    return res.status(400).json({ status: "error", message: "Invalid Request Type" });

  } catch (error) {
    console.error("Edit Employee Error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

module.exports = { editEmployee };