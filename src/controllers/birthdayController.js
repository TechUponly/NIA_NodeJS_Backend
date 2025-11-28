const birthdayService = require("../services/birthdayService");

/**
 * Get Upcoming Birthdays List
 */
const getBirthdays = async (req, res, next) => {
  try {
    const rawData = await birthdayService.getUpcomingBirthdays();

    // Get Base URL (e.g., http://localhost:3001)
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const birthdays = rawData.map((row) => {
      // 1. Format Date: "28 Nov"
      const date = new Date(row.dob);
      const formattedDob = date.toLocaleString('en-US', { 
        day: '2-digit', 
        month: 'short' 
      });

      // 2. Format Image URL
      // Points to: http://localhost:3001/admin/Upload/imageName.jpg
      const fullImageUrl = row.passphoto 
        ? `${baseUrl}/admin/Upload/${row.passphoto}` 
        : null;

      return {
        ename: row.ename,
        passphoto: fullImageUrl, 
        dob: formattedDob,
        emp_usercode: row.usercode
      };
    });

    if (birthdays.length > 0) {
      res.status(200).json({
        status: "found",
        birthdays: birthdays,
      });
    } else {
      res.status(200).json({
        status: "not found",
        birthdays: []
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get Birthday Wishes for a specific employee
 * PHP Equivalent: fetch_birthday_wishes.php
 */
const getWishes = async (req, res, next) => {
  try {
    // Get emp_id from query parameters (URL?emp_id=XYZ)
    const { emp_id } = req.query;

    if (!emp_id) {
      return res.status(400).json({
        message: "emp_id is required",
        status: false
      });
    }

    const data = await birthdayService.getBirthdayWishes(emp_id);

    // Return response in exact format required by PHP/Frontend
    res.status(200).json({
      data: data,
      message: "Fetched Successfully",
      status: true
    });

  } catch (error) {
    console.error("Error in getWishes:", error);
    // Pass error to global handler or send manual response
    res.status(500).json({
      message: "Could not fetch data, please try again",
      status: false
    });
  }
};

const submitWish = async (req, res, next) => {
  try {
    // Attempt to get data from Body (POST) first, fallback to Query (GET)
    const params = { ...req.query, ...req.body };

    const {
      emp_id,          // wished_from_empID
      bday_emp,        // wished_to_empID
      wishfrom_ename,  // wished_from
      wished_to,       // wished_to name
      wished_text      // The message
    } = params;

    // Basic Validation
    if (!emp_id || !bday_emp || !wished_text) {
      return res.status(400).json({
        message: "Missing required fields (emp_id, bday_emp, wished_text)",
        status: false
      });
    }

    await birthdayService.sendBirthdayWish(
      emp_id, 
      bday_emp, 
      wishfrom_ename, 
      wished_to, 
      wished_text
    );

    res.status(200).json({
      message: "Updated Successfully",
      status: true
    });

  } catch (error) {
    console.error("Error in submitWish:", error);
    res.status(500).json({
      message: "Could not update data please try again",
      status: false
    });
  }
};

module.exports = {
  getBirthdays,
  getWishes,
  submitWish
};