const nodemailer = require("nodemailer");
const { pool } = require("../config/database");

// 1. Fetch Credentials from DB
const getEmailCredentials = async () => {
  const query = "SELECT email, password FROM email_password WHERE id = 1 LIMIT 1";
  const [rows] = await pool.execute(query);
  return rows[0];
};

// 2. Configure Transporter
const createTransporter = async (credentials) => {
  return nodemailer.createTransport({
    host: "mail.uponly.in", 
    port: 465,            
    secure: true,
    auth: {
      user: credentials.email,
      pass: credentials.password,
    },
  });
};

// 3. Main Send Function
const sendLeaveNotification = async (leaveDetails, recipients) => {
  try {
    const creds = await getEmailCredentials();
    if (!creds) {
      console.error("Email credentials not found in DB.");
      return;
    }

    const transporter = await createTransporter(creds);

    const subject = `Leave Application: ${leaveDetails.empName} - ${leaveDetails.ltype}`;
    const text = `
      Hello,

      A new leave application has been submitted.

      Employee: ${leaveDetails.empName} (${leaveDetails.empCode})
      Leave Type: ${leaveDetails.ltype}
      From: ${leaveDetails.fdate}
      To: ${leaveDetails.tdate}
      Days: ${leaveDetails.no_of_days}
      Reason: ${leaveDetails.comment}

      Status: Pending Approval
    `;

    // Send the mail
    const info = await transporter.sendMail({
      from: `"HRMS System" <${creds.email}>`,
      to: recipients.join(","), 
      subject: subject,
      text: text,
    });

    console.log("Email sent: %s", info.messageId);
    return true;

  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};
const sendStatusUpdateEmail = async (leaveData, status, approverName, comments, recipients) => {
  try {
    const creds = await getEmailCredentials();
    if (!creds) return;

    const transporter = await createTransporter(creds);

    // Determine Color and Title based on status
    const isRejected = status === 'Rejected' || status === 'Cancelled';
    const actionText = isRejected ? "REJECTED" : "APPROVED";

    const subject = `Leave ${actionText}: ${leaveData.ename} - ${leaveData.ltype}`;
    
    const text = `
      Hello,

      The leave application status has been updated.

      Employee: ${leaveData.ename} (${leaveData.usercode})
      Leave Type: ${leaveData.ltype}
      Dates: ${leaveData.fdate} to ${leaveData.tdate}
      
      --------------------------------
      New Status: ${status}
      Action By: ${approverName}
      Comments: ${comments}
      --------------------------------

      Please login to the HRMS app for more details.
    `;

    const info = await transporter.sendMail({
      from: `"HRMS System" <${creds.email}>`,
      to: recipients.join(","), 
      subject: subject,
      text: text,
    });

    console.log("Status Email sent: %s", info.messageId);
    return true;

  } catch (error) {
    console.error("Error sending status email:", error);
    return false;
  }
};

module.exports = {
  sendLeaveNotification,
  sendStatusUpdateEmail,
};