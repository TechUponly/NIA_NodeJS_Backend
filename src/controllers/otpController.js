const otpService = require("../services/otpService");

const sendMobileOtp = async (req, res) => {
  try {
    // 1. Get Input (Support GET query or POST body)
    const mobile_no = req.query.mobile_no || req.body.mobile_no;

    if (!mobile_no) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    // 2. Configuration (Matches PHP logic)
    const default_otp = 8286;
    const use_default_otp = true; // Set to false if you want random OTP

    let rndno1;

    // 3. Determine OTP
    if (use_default_otp) {
      rndno1 = default_otp;
    } else {
      // Equivalent to PHP rand(1000, 9999)
      rndno1 = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);
    }

    // 4. Prepare Message
    const mobileWithCode = "91" + mobile_no;
    const message = `${rndno1} is your OTP for Uponly.in ( your One Time Password is valid for 10 minutes.)`;

    // 5. Call Service
    const smsResponse = await otpService.sendSMS(mobileWithCode, message);

    // 6. Prepare Response (Matches PHP output structure)
    const responseData = {
      OTP: rndno1,
      is_default_otp: use_default_otp,
      sms_sent: true, // Assuming true if code execution reached here
      message: "OTP sent successfully",
      mobile_number: mobile_no
    };

    // Include SMS API response for debugging (Logic from PHP)
    if (smsResponse) {
      responseData.sms_response = smsResponse;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server Error", 
      error: error.message 
    });
  }
};

module.exports = {
  sendMobileOtp
};