const express = require('express');
const router = express.Router();
const { isAuthenticated, isActive } = require('../middleware/auth');
const { LeaveType, LeaveRequest, Employee } = require('../models');
const leaveService = require('../services/leaveService');
const notificationService = require('../services/notificationService');
const { calculateWorkingDays, getCurrentYear, formatDate } = require('../utils/dateUtils');

// Apply authentication middleware to all routes
router.use(isAuthenticated, isActive);

// GET /employee/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const year = getCurrentYear();
    const balances = await leaveService.getEmployeeBalances(req.session.user.id, year);
    const recentRequests = await leaveService.getEmployeeRequests(req.session.user.id);

    res.render('employee/dashboard', {
      title: 'Dashboard',
      balances,
      recentRequests: recentRequests.slice(0, 5),
      year,
      formatDate
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Error loading dashboard');
    res.redirect('/');
  }
});

// GET /employee/apply
router.get('/apply', async (req, res) => {
  try {
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
    const year = getCurrentYear();
    const balances = await leaveService.getEmployeeBalances(req.session.user.id, year);

    res.render('employee/apply', {
      title: 'Apply for Leave',
      leaveTypes,
      balances
    });
  } catch (error) {
    console.error('Apply page error:', error);
    req.flash('error', 'Error loading apply page');
    res.redirect('/employee/dashboard');
  }
});

// POST /employee/apply
router.post('/apply', async (req, res) => {
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body;

    if (!leave_type_id || !start_date || !end_date) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/employee/apply');
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (startDate > endDate) {
      req.flash('error', 'End date must be after start date');
      return res.redirect('/employee/apply');
    }

    if (startDate < new Date().setHours(0, 0, 0, 0)) {
      req.flash('error', 'Cannot apply for leave in the past');
      return res.redirect('/employee/apply');
    }

    const totalDays = calculateWorkingDays(start_date, end_date);
    if (totalDays === 0) {
      req.flash('error', 'Selected dates only include weekends');
      return res.redirect('/employee/apply');
    }

    // Create leave request
    const request = await leaveService.createLeaveRequest({
      employeeId: req.session.user.id,
      leaveTypeId: parseInt(leave_type_id),
      startDate: start_date,
      endDate: end_date,
      reason
    });

    // Send notifications (Email + Slack) to admins
    const leaveType = await LeaveType.findByPk(leave_type_id);
    const employee = await Employee.findByPk(req.session.user.id);

    notificationService.notifyNewLeaveRequest(request, employee, leaveType);

    req.flash('success', 'Leave request submitted successfully');
    res.redirect('/employee/history');

  } catch (error) {
    console.error('Apply leave error:', error);
    req.flash('error', error.message || 'Error submitting leave request');
    res.redirect('/employee/apply');
  }
});

// GET /employee/history
router.get('/history', async (req, res) => {
  try {
    const year = req.query.year || getCurrentYear();
    const requests = await leaveService.getEmployeeRequests(req.session.user.id, year);

    res.render('employee/history', {
      title: 'Leave History',
      requests,
      year,
      currentYear: getCurrentYear(),
      formatDate
    });
  } catch (error) {
    console.error('History error:', error);
    req.flash('error', 'Error loading leave history');
    res.redirect('/employee/dashboard');
  }
});

// POST /employee/cancel/:id
router.post('/cancel/:id', async (req, res) => {
  try {
    // Get request details before cancelling
    const request = await LeaveRequest.findByPk(req.params.id, {
      include: [{ model: LeaveType, as: 'leaveType' }]
    });

    if (request) {
      await leaveService.cancelLeaveRequest(parseInt(req.params.id), req.session.user.id);

      // Send cancellation notification to HR
      const employee = await Employee.findByPk(req.session.user.id);
      notificationService.notifyLeaveCancelled(request, employee, request.leaveType);

      req.flash('success', 'Leave request cancelled');
    } else {
      req.flash('error', 'Leave request not found');
    }
  } catch (error) {
    console.error('Cancel error:', error);
    req.flash('error', error.message || 'Error cancelling request');
  }
  res.redirect('/employee/history');
});

// GET /employee/calendar
router.get('/calendar', async (req, res) => {
  res.render('employee/calendar', { title: 'My Leave Calendar' });
});

// API: Get calendar events
router.get('/api/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    const leaves = await leaveService.getLeavesForCalendar(start, end, req.session.user.id);

    const events = leaves.map(leave => ({
      id: leave.id,
      title: `${leave.leaveType.name} (${leave.status})`,
      start: leave.start_date,
      end: new Date(new Date(leave.end_date).getTime() + 86400000).toISOString().split('T')[0],
      color: leave.status === 'approved' ? '#28a745' : '#ffc107',
      extendedProps: {
        status: leave.status,
        leaveType: leave.leaveType.name,
        days: leave.total_days
      }
    }));

    res.json(events);
  } catch (error) {
    console.error('Calendar API error:', error);
    res.status(500).json({ error: 'Error loading calendar data' });
  }
});

// API: Calculate working days
router.get('/api/calculate-days', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.json({ days: 0 });
    }
    const days = calculateWorkingDays(start, end);
    res.json({ days });
  } catch (error) {
    res.json({ days: 0 });
  }
});

// API: Check balance
router.get('/api/check-balance', async (req, res) => {
  try {
    const { leaveTypeId, days } = req.query;
    const year = getCurrentYear();
    const result = await leaveService.canApplyLeave(
      req.session.user.id,
      parseInt(leaveTypeId),
      parseFloat(days),
      year
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error checking balance' });
  }
});

module.exports = router;
