const letterService = require("../services/letterService");

const checkAbscondingStatus = async (req, res) => {
  try {
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(200).json({ 
        status: 'error', 
        message: 'Missing emp_id' 
      });
    }

    const data = await letterService.getAbscondingDetails(emp_id);

    // PHP logic returns 'success' with empty array if no record found, 
    // but the query executed successfully.
    res.status(200).json({
      status: 'success',
      data: data
    });

  } catch (error) {
    console.error("Error in checkAbscondingStatus:", error);
    res.status(200).json({
      status: 'error',
      message: 'Failed to fetch Absconding details'
    });
  }
};

module.exports = {
  checkAbscondingStatus
};