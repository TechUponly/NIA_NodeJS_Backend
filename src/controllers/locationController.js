const locationService = require("../services/locationService");

const getLocations = async (req, res) => {
  try {
    const locations = await locationService.getOfficeLocations();

    if (locations.length > 0) {
      res.status(200).json({
        status: true,
        data: locations,
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
    console.error("Error in getLocations:", error);
    res.status(500).json({ status: false, errormessage: "Server Error" });
  }
};

module.exports = {
  getLocations
};