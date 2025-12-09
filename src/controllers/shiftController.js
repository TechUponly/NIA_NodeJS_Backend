const shiftService = require("../services/shiftService");

const getShiftTimings = async (req, res) => {
  try {
    const shifts = await shiftService.getAllShiftTimings();

    if (shifts.length > 0) {
      res.status(200).json({
        status: true,
        data: shifts,
        message: "data found"
      });
    } else {
      res.status(200).json({
        status: false,
        data: [],
        errormessage: "Sorry No Record Found" // Matching PHP key
      });
    }

  } catch (error) {
    console.error("Error in getShiftTimings:", error);
    res.status(500).json({ status: false, errormessage: "Server Error" });
  }
};

module.exports = {
  getShiftTimings
};