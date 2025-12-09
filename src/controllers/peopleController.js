const peopleService = require("../services/peopleService");

const getPeopleHierarchy = async (req, res) => {
  try {
    const { emp_id } = req.query; // This is the usercode (e.g. C001)

    if (!emp_id) {
      return res.status(400).json({ status: false, message: "Missing emp_id" });
    }

    // 1. Fetch Current User
    const currentUser = await peopleService.getEmployeeByCode(emp_id);
    
    if (!currentUser) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const currentEmpId = currentUser.emp_id;

    // 2. Fetch Manager (The person this user reports to)
    const manager = await peopleService.getManagerByEmpId(currentEmpId);

    // 3. Fetch Subordinates (People reporting to this user)
    const subordinates = await peopleService.getSubordinatesByManagerId(currentEmpId);

    // 4. Helper to format Image URLs
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    const formatImg = (img) => img ? `${baseUrl}/admin/Upload/${img}` : null;

    // 5. Format Subordinates Data
    const formattedSubordinates = subordinates.map(sub => ({
      ...sub,
      profileimg: formatImg(sub.profileimg)
    }));

    // 6. Build User Data Structure (User + Subordinates)
    const userDataFormatted = {
      ename: currentUser.name,
      emp_code: currentUser.emp_id, // PHP logic mapped emp_id to emp_code key
      post: currentUser.post,
      profileimg: formatImg(currentUser.profileimg),
      gender: currentUser.gender,
      mno: currentUser.mno,
      official_mail: currentUser.official_mail,
      employ: formattedSubordinates // Subordinates nested here
    };

    // 7. Build Manager Data Structure (Manager + User)
    // If no manager found (e.g. CEO), we might return just the user, 
    // but typically the PHP code assumes a manager exists or returns empty structure.
    
    let finalStructure = [];

    if (manager) {
      const managerDataFormatted = {
        emp_id: manager.emp_id,
        ename: manager.name,
        post: manager.post,
        mno: manager.mno,
        official_mail: manager.official_mail,
        profileimg: formatImg(manager.profileimg),
        gender: manager.gender,
        employ: [userDataFormatted] // User nested inside Manager
      };
      finalStructure.push(managerDataFormatted);
    } else {
      // Fallback if top of hierarchy (optional, depending on frontend requirement)
      // For exact PHP matching, if sql query fails, it might return empty or error.
      // We will wrap the user as the top level if no manager exists.
      finalStructure.push({
         ...userDataFormatted,
         emp_id: currentUser.emp_id, // Polyfill keys to match manager structure
         employ: formattedSubordinates
      });
    }

    // 8. Return JSON
    res.status(200).json(finalStructure);

  } catch (error) {
    console.error("Error in getPeopleHierarchy:", error);
    res.status(500).json({ status: false, message: "Server Error" });
  }
};

module.exports = {
  getPeopleHierarchy
};