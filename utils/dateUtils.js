/**
 * Calculate working days between two dates (excluding weekends)
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {number} Number of working days
 */
function calculateWorkingDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Format date for display
 * @param {Date|string} date
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format date for input fields (YYYY-MM-DD)
 * @param {Date|string} date
 * @returns {string} ISO date string
 */
function formatDateForInput(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Get current year
 * @returns {number} Current year
 */
function getCurrentYear() {
  return parseInt(process.env.CURRENT_YEAR) || new Date().getFullYear();
}

/**
 * Check if a date falls within current year
 * @param {Date|string} date
 * @returns {boolean}
 */
function isCurrentYear(date) {
  const d = new Date(date);
  return d.getFullYear() === getCurrentYear();
}

/**
 * Get start and end of year
 * @param {number} year
 * @returns {object} { start, end }
 */
function getYearBounds(year) {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31)
  };
}

module.exports = {
  calculateWorkingDays,
  formatDate,
  formatDateForInput,
  getCurrentYear,
  isCurrentYear,
  getYearBounds
};
