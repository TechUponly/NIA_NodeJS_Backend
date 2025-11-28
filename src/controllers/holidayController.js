const holidayService = require("../services/holidayService");

const getHolidays = async (req, res, next) => {
  try {
    const rawData = await holidayService.getUpcomingHolidays();

    const holidays = rawData.map((row) => {
      // Create Date object
      const date = new Date(row.festdate);

      // Manual formatting to match PHP "d M Y, l" (e.g., "28 Nov 2025, Friday")
      const day = date.getDate().toString().padStart(2, '0'); // "28"
      const month = date.toLocaleString('en-US', { month: 'short' }); // "Nov"
      const year = date.getFullYear(); // "2025"
      const weekday = date.toLocaleString('en-US', { weekday: 'long' }); // "Friday"

      const formattedDate = `${day} ${month} ${year}, ${weekday}`;

      return {
        holiday_id: row.holiday_id,
        festdate: formattedDate,
        festival: row.festival,
      };
    });

    if (holidays.length > 0) {
      res.status(200).json({
        status: "found",
        holidays: holidays,
      });
    } else {
      res.status(200).json({
        status: "not found",
      });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHolidays,
};