/**
 * Generate default password for employee
 * Format: firstname@2026 (lowercase)
 * @param {string} firstName
 * @returns {string} Default password
 */
function generateDefaultPassword(firstName) {
  const year = process.env.CURRENT_YEAR || new Date().getFullYear();
  return `${firstName.toLowerCase()}@${year}`;
}

/**
 * Validate password strength
 * @param {string} password
 * @returns {object} { isValid, message }
 */
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { isValid: false, message: 'Password must be at least 6 characters long' };
  }
  return { isValid: true, message: '' };
}

module.exports = {
  generateDefaultPassword,
  validatePassword
};
