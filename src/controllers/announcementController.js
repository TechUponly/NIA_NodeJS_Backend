const announcementService = require("../services/announcementService");

const getAnnouncements = async (req, res, next) => {
  try {
    const rawData = await announcementService.getAllAnnouncements();

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const announcements = rawData.map((row) => {
      const fullImageUrl = row.announcementImage 
        ? `${baseUrl}/Announcement/${row.announcementImage}` 
        : null;

      return {
        title: row.title,
        image: fullImageUrl,
        announcementText: row.announcementText,
      };
    });

    if (announcements.length > 0) {
      res.status(200).json({
        status: "found",
        announcements: announcements,
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
  getAnnouncements,
};