const { Holiday } = require('../models');
const { Op } = require('sequelize');
const slackService = require('./slackService');

/**
 * Holiday Service
 * Handles CRUD operations for public holidays and notifications
 */

// Country display names
const COUNTRY_NAMES = {
  'IN': 'India',
  'US': 'United States'
};

/**
 * Create a new holiday
 */
async function createHoliday(data) {
  const { name, date, country, description } = data;

  // Check for duplicate (same date and country)
  const existing = await Holiday.findOne({
    where: { date, country }
  });

  if (existing) {
    throw new Error(`A holiday already exists on ${date} for ${COUNTRY_NAMES[country]}`);
  }

  const holiday = await Holiday.create({
    name,
    date,
    country,
    description,
    year: new Date(date).getFullYear()
  });

  return holiday;
}

/**
 * Update an existing holiday
 */
async function updateHoliday(id, data) {
  const holiday = await Holiday.findByPk(id);

  if (!holiday) {
    throw new Error('Holiday not found');
  }

  const { name, date, country, description, is_active } = data;

  // Check for duplicate if date or country changed
  if (date !== holiday.date || country !== holiday.country) {
    const existing = await Holiday.findOne({
      where: {
        date,
        country,
        id: { [Op.ne]: id }
      }
    });

    if (existing) {
      throw new Error(`A holiday already exists on ${date} for ${COUNTRY_NAMES[country]}`);
    }
  }

  await holiday.update({
    name,
    date,
    country,
    description,
    is_active: is_active !== undefined ? is_active : holiday.is_active,
    year: new Date(date).getFullYear()
  });

  return holiday;
}

/**
 * Delete a holiday
 */
async function deleteHoliday(id) {
  const holiday = await Holiday.findByPk(id);

  if (!holiday) {
    throw new Error('Holiday not found');
  }

  await holiday.destroy();
  return true;
}

/**
 * Get a holiday by ID
 */
async function getHolidayById(id) {
  return await Holiday.findByPk(id);
}

/**
 * Get holidays by year with optional country filter
 */
async function getHolidaysByYear(year, country = null) {
  const where = { year, is_active: true };

  if (country) {
    where.country = country;
  }

  return await Holiday.findAll({
    where,
    order: [['date', 'ASC']]
  });
}

/**
 * Get all holidays for a specific country
 */
async function getHolidaysByCountry(country) {
  return await Holiday.findAll({
    where: { country, is_active: true },
    order: [['date', 'ASC']]
  });
}

/**
 * Get all holidays (with optional filters for admin view)
 */
async function getAllHolidays(filters = {}) {
  const where = {};

  if (filters.year) {
    where.year = filters.year;
  }

  if (filters.country) {
    where.country = filters.country;
  }

  if (filters.is_active !== undefined) {
    where.is_active = filters.is_active;
  }

  return await Holiday.findAll({
    where,
    order: [['date', 'ASC']]
  });
}

/**
 * Get tomorrow's holidays (for cron job notification)
 */
async function getTomorrowHolidays() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return await Holiday.findAll({
    where: {
      date: tomorrowStr,
      is_active: true
    },
    order: [['country', 'ASC']]
  });
}

/**
 * Get upcoming holidays within specified days
 */
async function getUpcomingHolidays(days = 7, country = null) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  const todayStr = today.toISOString().split('T')[0];
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const where = {
    date: {
      [Op.between]: [todayStr, futureDateStr]
    },
    is_active: true
  };

  if (country) {
    where.country = country;
  }

  return await Holiday.findAll({
    where,
    order: [['date', 'ASC']]
  });
}

/**
 * Send holiday notifications for tomorrow's holidays
 * Called by the cron job at 11 PM IST
 */
async function sendHolidayNotifications() {
  try {
    const holidays = await getTomorrowHolidays();

    if (holidays.length === 0) {
      console.log('[Holiday Service] No holidays tomorrow');
      return { sent: 0, holidays: [] };
    }

    console.log(`[Holiday Service] Found ${holidays.length} holiday(s) tomorrow`);

    const results = [];

    for (const holiday of holidays) {
      try {
        await slackService.notifyHolidayAnnouncement(holiday);
        console.log(`[Holiday Service] Sent notification for: ${holiday.name} (${holiday.country})`);
        results.push({ holiday: holiday.name, country: holiday.country, status: 'sent' });
      } catch (error) {
        console.error(`[Holiday Service] Failed to send notification for ${holiday.name}:`, error.message);
        results.push({ holiday: holiday.name, country: holiday.country, status: 'failed', error: error.message });
      }
    }

    return { sent: results.filter(r => r.status === 'sent').length, holidays: results };
  } catch (error) {
    console.error('[Holiday Service] Error sending notifications:', error);
    throw error;
  }
}

/**
 * Get available years for filtering (based on existing holidays)
 */
async function getAvailableYears() {
  const holidays = await Holiday.findAll({
    attributes: ['year'],
    group: ['year'],
    order: [['year', 'DESC']]
  });

  return holidays.map(h => h.year);
}

/**
 * Check if a date is a holiday for a specific country
 */
async function isHoliday(date, country) {
  const holiday = await Holiday.findOne({
    where: {
      date,
      country,
      is_active: true
    }
  });

  return holiday !== null;
}

module.exports = {
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidayById,
  getHolidaysByYear,
  getHolidaysByCountry,
  getAllHolidays,
  getTomorrowHolidays,
  getUpcomingHolidays,
  sendHolidayNotifications,
  getAvailableYears,
  isHoliday,
  COUNTRY_NAMES
};
