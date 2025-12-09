const pincodeService = require("../services/pincodeService");

const getPincodeData = async (req, res) => {
  try {
    // Support both GET (Query Param) and POST (Body)
    const pincode = req.query.pincode || req.body.pincode;

    if (!pincode) {
      return res.status(200).json({ status: "Not Found" });
    }

    const data = await pincodeService.getCityStateByPincode(pincode);

    if (data.length > 0) {
      res.status(200).json({
        status: "Found",
        citystate: data
      });
    } else {
      res.status(200).json({
        status: "Not Found"
      });
    }

  } catch (error) {
    console.error("Error in getPincodeData:", error);
    res.status(500).json({ status: "Error", message: "Server Error" });
  }
};

module.exports = {
  getPincodeData
};