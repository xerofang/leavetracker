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
  if (!webhookUrl) {
    console.log('Slack webhook not configured, skipping notification');
    return { success: false, message: 'Slack webhook not configured' };
  }

  return new Promise((resolve) => {
    try {
      const url = new URL(webhookUrl);
      const data = JSON.stringify(payload);

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
            console.log('Slack notification sent successfully');
            resolve({ success: true });
          } else {
            console.error('Slack error:', res.statusCode, responseData);
            resolve({ success: false, message: responseData });
          }
        });
      });

      req.on('error', (error) => {
        console.error('Slack request error:', error.message);
        resolve({ success: false, message: error.message });
      });

      req.write(data);
      req.end();
    } catch (error) {
      console.error('Slack error:', error.message);
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
 * Notify HR/Admin about new leave request
 */
async function notifyNewLeaveRequest(request, employee, leaveType) {
  const webhookUrl = process.env.SLACK_HR_WEBHOOK_URL;
  const companyName = process.env.COMPANY_NAME || 'Leave Tracker';

  const payload = {
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
            text: `*Employee:*\n${employee.first_name} ${employee.last_name}`
          },
          {
            type: 'mrkdwn',
            text: `*Department:*\n${employee.department || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          },
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
          text: `🔗 *Action Required:* Please login to <${process.env.APP_URL || 'the admin panel'}|${companyName} Leave Tracker> to approve or reject this request.`
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

  const payload = {
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
          text: `Great news <@${employee.email}>! Your leave request has been *approved*.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Employee:*\n${employee.first_name} ${employee.last_name}`
          },
          {
            type: 'mrkdwn',
            text: `*Approved By:*\n${adminName}`
          },
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          },
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

  const payload = {
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
          text: `Hi <@${employee.email}>, unfortunately your leave request has been *rejected*.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Employee:*\n${employee.first_name} ${employee.last_name}`
          },
          {
            type: 'mrkdwn',
            text: `*Rejected By:*\n${adminName}`
          },
          {
            type: 'mrkdwn',
            text: `*Leave Type:*\n${leaveType.name}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${request.total_days} day(s)`
          },
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

  const payload = {
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
          text: `${employee.first_name} ${employee.last_name} has cancelled their leave request.`
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
          },
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
