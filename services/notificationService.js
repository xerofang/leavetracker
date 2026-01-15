/**
 * Unified Notification Service
 * Handles both Email and Slack notifications
 */

const emailService = require('./emailService');
const slackService = require('./slackService');
const { Employee } = require('../models');

/**
 * Get all admin emails for notifications
 */
async function getAdminEmails() {
  const admins = await Employee.findAll({
    where: { role: 'admin', is_active: true },
    attributes: ['email']
  });
  return admins.map(a => a.email);
}

/**
 * Notify about new leave request (to HR/Admin)
 * Sends both Email and Slack notifications
 */
async function notifyNewLeaveRequest(request, employee, leaveType) {
  const results = { email: null, slack: null };

  try {
    // Get admin emails
    const adminEmails = await getAdminEmails();

    // Send email notifications to all admins
    if (adminEmails.length > 0) {
      results.email = await emailService.notifyLeaveRequest(request, employee, leaveType, adminEmails);
    }

    // Send Slack notification
    results.slack = await slackService.notifyNewLeaveRequest(request, employee, leaveType);

    console.log('New leave request notifications sent:', {
      employee: `${employee.first_name} ${employee.last_name}`,
      emailsSent: adminEmails.length,
      slackSent: results.slack?.success
    });

  } catch (error) {
    console.error('Error sending new leave request notifications:', error);
  }

  return results;
}

/**
 * Notify employee about leave approval
 * Sends both Email and Slack notifications
 */
async function notifyLeaveApproved(request, employee, leaveType, admin) {
  const results = { email: null, slack: null };
  const adminName = `${admin.first_name} ${admin.last_name}`;

  try {
    // Send email to employee
    results.email = await emailService.notifyLeaveApproved(request, employee, leaveType, adminName);

    // Send Slack notification
    results.slack = await slackService.notifyLeaveApproved(request, employee, leaveType, adminName);

    console.log('Leave approval notifications sent:', {
      employee: `${employee.first_name} ${employee.last_name}`,
      approvedBy: adminName,
      emailSent: results.email?.success,
      slackSent: results.slack?.success
    });

  } catch (error) {
    console.error('Error sending leave approval notifications:', error);
  }

  return results;
}

/**
 * Notify employee about leave rejection
 * Sends both Email and Slack notifications
 */
async function notifyLeaveRejected(request, employee, leaveType, admin) {
  const results = { email: null, slack: null };
  const adminName = `${admin.first_name} ${admin.last_name}`;

  try {
    // Send email to employee
    results.email = await emailService.notifyLeaveRejected(request, employee, leaveType, adminName);

    // Send Slack notification
    results.slack = await slackService.notifyLeaveRejected(request, employee, leaveType, adminName);

    console.log('Leave rejection notifications sent:', {
      employee: `${employee.first_name} ${employee.last_name}`,
      rejectedBy: adminName,
      emailSent: results.email?.success,
      slackSent: results.slack?.success
    });

  } catch (error) {
    console.error('Error sending leave rejection notifications:', error);
  }

  return results;
}

/**
 * Notify about leave cancellation (to HR/Admin)
 */
async function notifyLeaveCancelled(request, employee, leaveType) {
  const results = { email: null, slack: null };

  try {
    // Send Slack notification to HR
    results.slack = await slackService.notifyLeaveCancelled(request, employee, leaveType);

    // Optionally send email to admins
    const adminEmails = await getAdminEmails();
    if (adminEmails.length > 0) {
      const subject = `Leave Request Cancelled - ${employee.first_name} ${employee.last_name}`;
      const html = `
        <h2>Leave Request Cancelled</h2>
        <p><strong>Employee:</strong> ${employee.first_name} ${employee.last_name}</p>
        <p><strong>Leave Type:</strong> ${leaveType.name}</p>
        <p><strong>From:</strong> ${new Date(request.start_date).toLocaleDateString()}</p>
        <p><strong>To:</strong> ${new Date(request.end_date).toLocaleDateString()}</p>
        <p><strong>Days:</strong> ${request.total_days}</p>
        <p>The employee has cancelled this leave request.</p>
      `;

      for (const email of adminEmails) {
        await emailService.sendEmail(email, subject, html);
      }
      results.email = { success: true };
    }

    console.log('Leave cancellation notifications sent:', {
      employee: `${employee.first_name} ${employee.last_name}`,
      slackSent: results.slack?.success
    });

  } catch (error) {
    console.error('Error sending leave cancellation notifications:', error);
  }

  return results;
}

/**
 * Send welcome notification to new employee
 */
async function notifyNewEmployee(employee, password) {
  try {
    await emailService.sendWelcomeEmail(employee, password);
    console.log('Welcome email sent to:', employee.email);
    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  notifyNewLeaveRequest,
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyLeaveCancelled,
  notifyNewEmployee,
  getAdminEmails
};
