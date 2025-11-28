const { pool } = require("../config/database");

/**
 * Fetch upcoming birthdays (Next 10 birthdays)
 */
const getUpcomingBirthdays = async () => {
  try {
    const query = `
      SELECT * FROM employee 
      WHERE DATE_FORMAT(dob, '%m-%d') >= DATE_FORMAT(now(), '%m-%d') 
      AND usercode <> '' 
      AND post NOT IN ('Variable Tele Assist') 
      ORDER BY DATE_FORMAT(dob, '%m-%d') 
      LIMIT 5
    `;
    
    const [rows] = await pool.execute(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch birthday wishes for a specific employee for today
 * @param {string} empId 
 */
const getBirthdayWishes = async (empId) => {
  try {
    // Get current date in YYYY-MM-DD format (matches PHP date("Y-m-d"))
    const currentDate = new Date().toISOString().split('T')[0];

    const query = `
      SELECT * FROM birthday_wishes 
      WHERE wished_to_empID = ? AND data_date = ?
    `;
    
    // Execute query with parameters
    const [rows] = await pool.execute(query, [empId, currentDate]);
    
    return rows;
  } catch (error) {
    throw error;
  }
};

const sendFCMNotification = async (title, body, token) => {
  const url = 'https://fcm.googleapis.com/fcm/send';
  const serverKey = 'AAAARrZthwA:APA91bEtbJ2lDlvG-iRw6WKDGNw511IXo6gmwfe00niKrWo0TY7dX1DdOZ5a8n7NtjJyqvQf_9aEGuz2-EBt6IEcg6fE-uN6v0Dhk6GD9gIneT-HbtmzK4EQZgusi1UkhNPhldxYLgK8';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notification: {
          title: title,
          body: body
        },
        to: token
      })
    });
    
    // Optional: Log result
    // const data = await response.json();
    // console.log("FCM Response:", data);
  } catch (error) {
    console.error("Error sending FCM notification:", error);
  }
};

/**
 * Save birthday wish to DB and send notification
 */
const sendBirthdayWish = async (wishedFromEmpId, wishedToEmpId, wishedFrom, wishedTo, wishedText) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Insert the Wish
    const insertQuery = `
      INSERT INTO birthday_wishes
      (data_date, wished_to, wished_to_empID, wished_from, wished_from_empID, wish_text) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const [insertResult] = await connection.execute(insertQuery, [
      currentDate, 
      wishedTo, 
      wishedToEmpId, 
      wishedFrom, 
      wishedFromEmpId, 
      wishedText
    ]);

    if (insertResult.affectedRows === 0) {
      throw new Error("Failed to insert birthday wish");
    }

    // 2. Fetch Token for Notification
    // We use the MySQL function getEmployeeNameByEmpCode just like your PHP code did
    const tokenQuery = `
      SELECT 
        token, 
        getEmployeeNameByEmpCode(?) as empName, 
        getEmployeeNameByEmpCode(?) as wishby 
      FROM fcm_token 
      WHERE emp_code = ?
    `;

    const [rows] = await connection.execute(tokenQuery, [
      wishedToEmpId,   // First ?
      wishedFromEmpId, // Second ?
      wishedToEmpId    // Third ?
    ]);

    // 3. Send Notification if token exists
    if (rows.length > 0) {
      const { token, wishby } = rows[0];
      if (token) {
        await sendFCMNotification(
          `Birthday Wishes from ${wishby}`, 
          wishedText, 
          token
        );
      }
    }

    await connection.commit();
    return { success: true };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getUpcomingBirthdays,
  getBirthdayWishes,
  sendBirthdayWish,
};