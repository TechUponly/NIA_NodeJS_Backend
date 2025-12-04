const yearEndService = require("../services/yearEndService");

const runYearEndProcess = async (req, res) => {
  try {
   
    console.log("Starting Year End Leave Processing...");
    
    const result = await yearEndService.processYearEnd();

    res.status(200).json({
      message: "Year End Processing Completed",
      details: result
    });

  } catch (error) {
    console.error("Critical Error in Year End Process:", error);
    res.status(500).json({
      message: "Critical Server Error during processing",
      error: error.message
    });
  }
};

module.exports = {
  runYearEndProcess
};