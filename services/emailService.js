const nodemailer = require('nodemailer');
const emailConfig = require('../config/email');

let transporter = null;

/**
 * Initialize email transporter
 */
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.auth
    });
  }
  return transporter;
}

/**
 * Send email
 */
async function sendEmail(to, subject, html) {
  try {
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      console.log('Email not configured, skipping:', { to, subject });
      return { success: false, message: 'Email not configured' };
    }

    const transport = getTransporter();
    const info = await transport.sendMail({
      from: `"${process.env.COMPANY_NAME || 'Leave Tracker'}" <${emailConfig.from}>`,
      to,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Send leave request notification to admins
 */
async function notifyLeaveRequest(request, employee, leaveType, adminEmails) {
  const subject = `New Leave Request from ${employee.first_name} ${employee.last_name}`;
  const html = `
    <h2>New Leave Request</h2>
    <p><strong>Employee:</strong> ${employee.first_name} ${employee.last_name}</p>
    <p><strong>Department:</strong> ${employee.department || 'N/A'}</p>
    <p><strong>Leave Type:</strong> ${leaveType.name}</p>
    <p><strong>From:</strong> ${new Date(request.start_date).toLocaleDateString()}</p>
    <p><strong>To:</strong> ${new Date(request.end_date).toLocaleDateString()}</p>
    <p><strong>Days:</strong> ${request.total_days}</p>
    <p><strong>Reason:</strong> ${request.reason || 'Not provided'}</p>
    <br>
    <p>Please login to the admin panel to approve or reject this request.</p>
  `;

  for (const email of adminEmails) {
    await sendEmail(email, subject, html);
  }
}

/**
 * Send leave approval notification to employee
 */
async function notifyLeaveApproved(request, employee, leaveType, adminName) {
  const subject = `Leave Request Approved`;
  const html = `
    <h2>Your Leave Request Has Been Approved</h2>
    <p>Dear ${employee.first_name},</p>
    <p>Your leave request has been approved by ${adminName}.</p>
    <p><strong>Leave Type:</strong> ${leaveType.name}</p>
    <p><strong>From:</strong> ${new Date(request.start_date).toLocaleDateString()}</p>
    <p><strong>To:</strong> ${new Date(request.end_date).toLocaleDateString()}</p>
    <p><strong>Days:</strong> ${request.total_days}</p>
    ${request.admin_remarks ? `<p><strong>Remarks:</strong> ${request.admin_remarks}</p>` : ''}
    <br>
    <p>Enjoy your time off!</p>
  `;

  await sendEmail(employee.email, subject, html);
}

/**
 * Send leave rejection notification to employee
 */
async function notifyLeaveRejected(request, employee, leaveType, adminName) {
  const subject = `Leave Request Rejected`;
  const html = `
    <h2>Your Leave Request Has Been Rejected</h2>
    <p>Dear ${employee.first_name},</p>
    <p>Unfortunately, your leave request has been rejected by ${adminName}.</p>
    <p><strong>Leave Type:</strong> ${leaveType.name}</p>
    <p><strong>From:</strong> ${new Date(request.start_date).toLocaleDateString()}</p>
    <p><strong>To:</strong> ${new Date(request.end_date).toLocaleDateString()}</p>
    <p><strong>Days:</strong> ${request.total_days}</p>
    ${request.admin_remarks ? `<p><strong>Reason:</strong> ${request.admin_remarks}</p>` : ''}
    <br>
    <p>Please contact HR if you have any questions.</p>
  `;

  await sendEmail(employee.email, subject, html);
}

/**
 * Send welcome email to new employee
 */
async function sendWelcomeEmail(employee, password) {
  const subject = `Welcome to ${process.env.COMPANY_NAME || 'Our Company'} - Leave Tracker Account`;
  const html = `
    <h2>Welcome ${employee.first_name}!</h2>
    <p>Your account has been created on the Leave Tracker system.</p>
    <p><strong>Email:</strong> ${employee.email}</p>
    <p><strong>Password:</strong> ${password}</p>
    <br>
    <p>Please login and change your password for security purposes.</p>
    <p>If you have any questions, please contact HR.</p>
  `;

  await sendEmail(employee.email, subject, html);
}

module.exports = {
  sendEmail,
  notifyLeaveRequest,
  notifyLeaveApproved,
  notifyLeaveRejected,
  sendWelcomeEmail
};
