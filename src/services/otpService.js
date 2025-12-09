const axios = require("axios");

const sendSMS = async (mobileNumber, message) => {
  try {
    const url = "https://smppapi.theitmatic.com/api/v2/SendSMS";
    
    const payload = {
      "SenderId": "UPONLY",
      "Is_Unicode": false,
      "Is_Flash": false,
      "Message": message,
      "MobileNumbers": mobileNumber, // Expecting format like "919876543210"
      "ApiKey": "ziZ6UeSAZ875J/14k7WoqrSlFcRvMKIQR2/gFs2GPIE=",
      "ClientId": "c086bf1a-fe35-4e5b-bf5d-c68e0c8df39b"
    };

    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    return response.data;
  } catch (error) {
    console.error("SMS API Error:", error.message);
    // We return null or the error so the controller knows it failed, 
    // but we don't crash the app.
    return null;
  }
};

module.exports = {
  sendSMS
};