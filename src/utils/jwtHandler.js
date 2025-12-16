const jwt = require('jsonwebtoken');
require('dotenv').config();

class TokenHandler {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'your_secret_key_change_in_production';
    this.expiry = process.env.JWT_EXPIRY || '7d';
  }

  /**
   * Generate JWT token
   * @param {string} emp_code - Employee code
   * @returns {string} JWT token
   */
  generateToken(emp_code) {
    try {
      const payload = {
        emp_code: emp_code,
        timestamp: Date.now(),
      };

      const token = jwt.sign(payload, this.secret, {
        expiresIn: this.expiry,
      });

      return token;
    } catch (error) {
      console.error('Token generation error:', error);
      throw new Error('Failed to generate token');
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} Decoded token payload
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret);
      return decoded;
    } catch (error) {
      console.error('Token verification error:', error);
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Decode token without verification
   * @param {string} token - JWT token
   * @returns {object} Decoded token
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      console.error('Token decode error:', error);
      return null;
    }
  }
}

module.exports = new TokenHandler();