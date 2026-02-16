/**
 * Holiday Scheduler
 * Sends Slack notifications for upcoming public holidays
 * Runs daily at 11:00 PM IST (17:30 UTC)
 */

const cron = require('node-cron');
const holidayService = require('../services/holidayService');

let isSchedulerStarted = false;

/**
 * Start the holiday notification scheduler
 * Runs at 11:00 PM IST daily (5:30 PM UTC)
 * IST = UTC + 5:30, so 11:00 PM IST = 23:00 - 5:30 = 17:30 UTC
 */
function startScheduler() {
  if (isSchedulerStarted) {
    console.log('[Holiday Scheduler] Already started, skipping...');
    return;
  }

  // Schedule: minute hour day-of-month month day-of-week
  // 30 17 * * * = 5:30 PM UTC = 11:00 PM IST
  cron.schedule('30 17 * * *', async () => {
    console.log('[Holiday Scheduler] Running daily holiday check at', new Date().toISOString());

    try {
      const result = await holidayService.sendHolidayNotifications();
      console.log(`[Holiday Scheduler] Completed. Sent ${result.sent} notification(s)`);

      if (result.holidays.length > 0) {
        result.holidays.forEach(h => {
          console.log(`  - ${h.holiday} (${h.country}): ${h.status}`);
        });
      }
    } catch (error) {
      console.error('[Holiday Scheduler] Error during scheduled run:', error);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  isSchedulerStarted = true;
  console.log('[Holiday Scheduler] Started - will run daily at 11:00 PM IST');
}

/**
 * Manually trigger holiday notifications (for testing)
 */
async function triggerNow() {
  console.log('[Holiday Scheduler] Manual trigger at', new Date().toISOString());
  try {
    const result = await holidayService.sendHolidayNotifications();
    console.log(`[Holiday Scheduler] Manual trigger completed. Sent ${result.sent} notification(s)`);
    return result;
  } catch (error) {
    console.error('[Holiday Scheduler] Manual trigger error:', error);
    throw error;
  }
}

module.exports = {
  startScheduler,
  triggerNow
};
