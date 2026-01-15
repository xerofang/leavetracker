/**
 * Slack Notification Service
 * Uses Slack Incoming Webhooks to send notifications
 */

const https = require('https');
const http = require('http');

/**
 * Send message to Slack webhook
 */
async function sendToSlack(webhookUrl, payload) {
  console.log('Slack: Attempting to send notification...');
  console.log('Slack: Webhook URL configured:', webhookUrl ? 'Yes' : 'No');

  if (!webhookUrl) {
    console.log('Slack: Webhook not configured, skipping notification');
    return { success: false, message: 'Slack webhook not configured' };
  }

  return new Promise((resolve) => {
    try {
      const url = new URL(webhookUrl);
      const data = JSON.stringify(payload);

      console.log('Slack: Sending to', url.hostname + url.pathname);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('Slack: Notification sent successfully');
            resolve({ success: true });
          } else {
            console.error('Slack: Error response:', res.statusCode, responseData);
            resolve({ success: false, message: responseData });
          }
        });
      });

      req.on('error', (error) => {
        console.error('Slack: Request error:', error.message);
        resolve({ success: false, message: error.message });
      });

      req.write(data);
      req.end();
    } catch (error) {
      console.error('Slack: Exception:', error.message);
      resolve({ success: false, message: error.message });
    }
  });
}

/**
 * Format date for display
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format employee name with Slack @mention if slack_user_id is available
 */
function formatEmployeeMention(employee) {
  const fullName = `${employee.first_name} ${employee.last_name}`;
  if (employee.slack_user_id) {
    return `<@${employee.slack_user_id}>`;
  }
  return fullName;
}

/**
 * Format employee name for bold display (with @mention if available)
 */
function formatEmployeeBold(employee) {
  const fullName = `${employee.first_name} ${employee.last_name}`;
  if (employee.slack_user_id) {
    return `<@${employee.slack_user_id}> (${fullName})`;
  }
  return `*${fullName}*`;
}

/**
 * Notify HR/Admin about new leave request
 */
async function notifyNewLeaveRequest(request, employee, leaveType) {
  const webhookUrl = process.env.SLACK_HR_WEBHOOK_URL;
  const companyName = process.env.COMPANY_NAME || 'Leave Tracker';
  const appUrl = process.env.APP_URL || '';
  const employeeName = `${employee.first_name} ${employee.last_name}`;
  const employeeMention = formatEmployeeMention(employee);

  // Simple text fallback (required by Slack)
  const textFallback = `📋 New Leave Request from ${employeeName}\n` +
    `• Leave Type: ${leaveType.name}\n` +
    `• Duration: ${request.total_days} day(s)\n` +
    `• From: ${formatDate(request.start_date)} To: ${formatDate(request.end_date)}\n` +
    `• Reason: ${request.reason || 'Not provided'}\n` +
    `Please login to approve or reject this request.`;

  const payload = {
    text: textFallback,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 New Leave Request',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Employee:*\n${employee.slack_user_id ? employeeMention + ' (' + employeeName + ')' : employeeName}`
          },
          {
            type: 'mrkdwn',
            text: `*Department:*\n${employee.department || 'N/A'}`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${formatDate(request.start_date)}`
          },
          {
            type: 'mrkdwn',
            text: `*To:*\n${formatDate(request.end_date)}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:*\n${request.reason || '_No reason provided_'}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📧 ${employee.email} | Submitted: ${formatDate(new Date())}`
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: appUrl
            ? `🔗 *Action Required:* Please login to <${appUrl}|${companyName} Leave Tracker> to approve or reject.`
            : `🔗 *Action Required:* Please login to approve or reject this request.`
        }
      }
    ]
  };

  return sendToSlack(webhookUrl, payload);
}

/**
 * Notify employee about leave approval
 */
async function notifyLeaveApproved(request, employee, leaveType, adminName) {
  const webhookUrl = process.env.SLACK_EMPLOYEE_WEBHOOK_URL || process.env.SLACK_HR_WEBHOOK_URL;
  const employeeMention = formatEmployeeMention(employee);
  const employeeBold = formatEmployeeBold(employee);

  // Simple text fallback
  const textFallback = `✅ Leave Approved for ${employee.first_name} ${employee.last_name}\n` +
    `• Leave Type: ${leaveType.name}\n` +
    `• Duration: ${request.total_days} day(s)\n` +
    `• From: ${formatDate(request.start_date)} To: ${formatDate(request.end_date)}\n` +
    `• Approved by: ${adminName}`;

  const payload = {
    text: textFallback,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Leave Request Approved',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Great news ${employeeBold}! Your leave request has been *approved*.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${formatDate(request.start_date)}`
          },
          {
            type: 'mrkdwn',
            text: `*To:*\n${formatDate(request.end_date)}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Approved By:* ${adminName}`
        }
      }
    ]
  };

  if (request.admin_remarks) {
    payload.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Remarks:*\n${request.admin_remarks}`
      }
    });
  }

  payload.blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '🎉 Enjoy your time off!'
      }
    ]
  });

  return sendToSlack(webhookUrl, payload);
}

/**
 * Notify employee about leave rejection
 */
async function notifyLeaveRejected(request, employee, leaveType, adminName) {
  const webhookUrl = process.env.SLACK_EMPLOYEE_WEBHOOK_URL || process.env.SLACK_HR_WEBHOOK_URL;
  const employeeMention = formatEmployeeMention(employee);
  const employeeBold = formatEmployeeBold(employee);

  // Simple text fallback
  const textFallback = `❌ Leave Rejected for ${employee.first_name} ${employee.last_name}\n` +
    `• Leave Type: ${leaveType.name}\n` +
    `• Duration: ${request.total_days} day(s)\n` +
    `• From: ${formatDate(request.start_date)} To: ${formatDate(request.end_date)}\n` +
    `• Rejected by: ${adminName}\n` +
    `${request.admin_remarks ? `• Reason: ${request.admin_remarks}` : ''}`;

  const payload = {
    text: textFallback,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '❌ Leave Request Rejected',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Hi ${employeeBold}, unfortunately your leave request has been *rejected*.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${formatDate(request.start_date)}`
          },
          {
            type: 'mrkdwn',
            text: `*To:*\n${formatDate(request.end_date)}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Rejected By:* ${adminName}`
        }
      }
    ]
  };

  if (request.admin_remarks) {
    payload.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reason for rejection:*\n${request.admin_remarks}`
      }
    });
  }

  payload.blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '📧 Please contact HR if you have any questions.'
      }
    ]
  });

  return sendToSlack(webhookUrl, payload);
}

/**
 * Notify about leave cancellation
 */
async function notifyLeaveCancelled(request, employee, leaveType) {
  const webhookUrl = process.env.SLACK_HR_WEBHOOK_URL;
  const employeeName = `${employee.first_name} ${employee.last_name}`;
  const employeeBold = formatEmployeeBold(employee);

  // Simple text fallback
  const textFallback = `🚫 Leave Cancelled by ${employeeName}\n` +
    `• Leave Type: ${leaveType.name}\n` +
    `• Duration: ${request.total_days} day(s)\n` +
    `• From: ${formatDate(request.start_date)} To: ${formatDate(request.end_date)}`;

  const payload = {
    text: textFallback,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚫 Leave Request Cancelled',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${employeeBold} has cancelled their leave request.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${formatDate(request.start_date)}`
          },
          {
            type: 'mrkdwn',
            text: `*To:*\n${formatDate(request.end_date)}`
          }
        ]
      }
    ]
  };

  return sendToSlack(webhookUrl, payload);
}

/**
 * Send a custom message to Slack
 */
async function sendCustomMessage(message, channel = 'hr') {
  const webhookUrl = channel === 'hr'
    ? process.env.SLACK_HR_WEBHOOK_URL
    : process.env.SLACK_EMPLOYEE_WEBHOOK_URL;

  const payload = {
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ]
  };

  return sendToSlack(webhookUrl, payload);
}

module.exports = {
  sendToSlack,
  notifyNewLeaveRequest,
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyLeaveCancelled,
  sendCustomMessage
};
