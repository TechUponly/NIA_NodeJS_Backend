const mysql = require("mysql2");
require("dotenv").config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "newagesecure-qa-hrms",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Promise-based pool
const promisePool = pool.promise();

// Test database connection
const testConnection = async () => {
  try {
    const connection = await promisePool.getConnection();
    console.log("✅ Database connected successfully");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
};

module.exports = {
  pool: promisePool,
  testConnection
};
