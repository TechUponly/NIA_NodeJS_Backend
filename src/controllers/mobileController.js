const mobileService = require("../services/mobileService");

const getAppLevels = async (req, res) => {
  try {
    const data = await mobileService.getMobileAppLevels();

    if (data.length > 0) {
      // PHP echoed the array directly: echo json_encode($data);
      res.status(200).json(data);
    } else {
      res.status(200).json({ message: 'No records found' });
    }

  } catch (error) {
    console.error("Error in getAppLevels:", error);
    res.status(500).json({ 
      error: 'Query Failed', 
      details: error.message 
    });
  }
};

module.exports = {
  getAppLevels
};