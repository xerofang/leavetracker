const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { Employee, LeaveType, LeaveRequest, LeaveBalance } = require('../models');
const leaveService = require('../services/leaveService');
const notificationService = require('../services/notificationService');
const reportService = require('../services/reportService');
const { generateDefaultPassword } = require('../utils/passwordUtils');
const { calculateWorkingDays, getCurrentYear, formatDate } = require('../utils/dateUtils');
const { Op } = require('sequelize');

// Apply authentication middleware to all routes
router.use(isAuthenticated, isAdmin);

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await reportService.getDashboardStats();
    const pendingRequests = await leaveService.getPendingRequests();

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats,
      pendingRequests: pendingRequests.slice(0, 10),
      formatDate
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    req.flash('error', 'Error loading dashboard');
    res.redirect('/');
  }
});

// GET /admin/employees
router.get('/employees', async (req, res) => {
  try {
    const { status, department, search } = req.query;
    const where = {};

    if (status === 'active') where.status = 'Active';
    if (status === 'probation') where.status = 'Probation';
    if (status === 'inactive') where.is_active = false;
    if (department) where.department = department;
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { employee_id: { [Op.like]: `%${search}%` } }
      ];
    }

    const employees = await Employee.findAll({
      where,
      order: [['employee_id', 'ASC'], ['first_name', 'ASC']]
    });

    const departments = await Employee.findAll({
      attributes: ['department'],
      group: ['department'],
      where: { department: { [Op.ne]: null } }
    });

    res.render('admin/employees', {
      title: 'Employees',
      employees,
      departments: departments.map(d => d.department),
      filters: { status, department, search }
    });
  } catch (error) {
    console.error('Employees error:', error);
    req.flash('error', 'Error loading employees');
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/employees/add
router.get('/employees/add', (req, res) => {
  res.render('admin/employee-form', {
    title: 'Add Employee',
    employee: null,
    isEdit: false,
    currentYear: getCurrentYear()
  });
});

// POST /admin/employees/add
router.post('/employees/add', async (req, res) => {
  try {
    const { employee_id, email, first_name, last_name, department, role, join_date, emp_status, leave_year_start, slack_user_id } = req.body;

    const existing = await Employee.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      req.flash('error', 'An employee with this email already exists');
      return res.redirect('/admin/employees/add');
    }

    const password = generateDefaultPassword(first_name);
    const employee = await Employee.create({
      employee_id: employee_id || null,
      email: email.toLowerCase(),
      password,
      first_name,
      last_name,
      department,
      join_date: join_date || null,
      status: emp_status || 'Active',
      role: role || 'employee',
      is_active: true,
      leave_year_start: leave_year_start || null,
      slack_user_id: slack_user_id || null
    });

    // Create initial leave balances
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
    const year = getCurrentYear();
    const isProbation = emp_status === 'Probation';
    const effectiveJoinDate = join_date || new Date().toISOString().split('T')[0];

    for (const leaveType of leaveTypes) {
      // Calculate pro-rata for probation employees (3 month probation period)
      let entitledDays = leaveType.default_days;
      if (isProbation && join_date) {
        entitledDays = leaveService.calculateProRataEntitlement(leaveType.default_days, join_date, 3);
      }

      await LeaveBalance.create({
        employee_id: employee.id,
        leave_type_id: leaveType.id,
        year,
        entitled_days: entitledDays,
        used_days: 0,
        pending_days: 0
      });
    }

    // Send welcome email notification
    notificationService.notifyNewEmployee(employee, password);

    const proRataMsg = isProbation ? ' (Pro-rata entitlement applied for probation)' : '';
    req.flash('success', `Employee ${first_name} ${last_name} added successfully. Default password: ${password}${proRataMsg}`);
    res.redirect('/admin/employees');

  } catch (error) {
    console.error('Add employee error:', error);
    req.flash('error', error.message || 'Error adding employee');
    res.redirect('/admin/employees/add');
  }
});

// GET /admin/employees/edit/:id
router.get('/employees/edit/:id', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) {
      req.flash('error', 'Employee not found');
      return res.redirect('/admin/employees');
    }

    res.render('admin/employee-form', {
      title: 'Edit Employee',
      employee,
      isEdit: true
    });
  } catch (error) {
    console.error('Edit employee error:', error);
    req.flash('error', 'Error loading employee');
    res.redirect('/admin/employees');
  }
});

// POST /admin/employees/edit/:id
router.post('/employees/edit/:id', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) {
      req.flash('error', 'Employee not found');
      return res.redirect('/admin/employees');
    }

    const { employee_id, first_name, last_name, department, role, is_active, reset_password, join_date, emp_status, leave_year_start, slack_user_id } = req.body;

    const updateData = {
      employee_id: employee_id || employee.employee_id,
      first_name,
      last_name,
      department,
      join_date: join_date || employee.join_date,
      status: emp_status || employee.status,
      role: role || 'employee',
      is_active: is_active === 'on' || is_active === 'true',
      leave_year_start: leave_year_start || employee.leave_year_start,
      slack_user_id: slack_user_id || null
    };

    if (reset_password === 'on') {
      updateData.password = generateDefaultPassword(first_name);
      req.flash('success', `Password reset to: ${updateData.password}`);
    }

    await employee.update(updateData);

    req.flash('success', 'Employee updated successfully');
    res.redirect('/admin/employees');

  } catch (error) {
    console.error('Update employee error:', error);
    req.flash('error', error.message || 'Error updating employee');
    res.redirect(`/admin/employees/edit/${req.params.id}`);
  }
});

// POST /admin/employees/toggle/:id
router.post('/employees/toggle/:id', async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) {
      req.flash('error', 'Employee not found');
      return res.redirect('/admin/employees');
    }

    await employee.update({ is_active: !employee.is_active });
    req.flash('success', `Employee ${employee.is_active ? 'activated' : 'deactivated'} successfully`);
    res.redirect('/admin/employees');

  } catch (error) {
    console.error('Toggle employee error:', error);
    req.flash('error', 'Error updating employee status');
    res.redirect('/admin/employees');
  }
});

// GET /admin/requests
router.get('/requests', async (req, res) => {
  try {
    const { status, employee_id, leave_type_id } = req.query;
    const filters = {};

    if (status) filters.status = status;
    if (employee_id) filters.employeeId = parseInt(employee_id);
    if (leave_type_id) filters.leaveTypeId = parseInt(leave_type_id);

    const requests = await leaveService.getAllRequests(filters);
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });

    res.render('admin/requests', {
      title: 'Leave Requests',
      requests,
      employees,
      leaveTypes,
      filters: { status, employee_id, leave_type_id },
      formatDate
    });
  } catch (error) {
    console.error('Requests error:', error);
    req.flash('error', 'Error loading requests');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/requests/approve/:id
router.post('/requests/approve/:id', async (req, res) => {
  try {
    const { remarks } = req.body;
    const request = await leaveService.approveLeaveRequest(
      parseInt(req.params.id),
      req.session.user.id,
      remarks
    );

    // Send notifications (Email + Slack) to employee
    const employee = await Employee.findByPk(request.employee_id);
    const leaveType = await LeaveType.findByPk(request.leave_type_id);
    const admin = await Employee.findByPk(req.session.user.id);

    notificationService.notifyLeaveApproved(request, employee, leaveType, admin);

    req.flash('success', 'Leave request approved');
  } catch (error) {
    console.error('Approve error:', error);
    req.flash('error', error.message || 'Error approving request');
  }
  res.redirect('/admin/requests');
});

// POST /admin/requests/reject/:id
router.post('/requests/reject/:id', async (req, res) => {
  try {
    const { remarks } = req.body;
    const request = await leaveService.rejectLeaveRequest(
      parseInt(req.params.id),
      req.session.user.id,
      remarks
    );

    // Send notifications (Email + Slack) to employee
    const employee = await Employee.findByPk(request.employee_id);
    const leaveType = await LeaveType.findByPk(request.leave_type_id);
    const admin = await Employee.findByPk(req.session.user.id);

    notificationService.notifyLeaveRejected(request, employee, leaveType, admin);

    req.flash('success', 'Leave request rejected');
  } catch (error) {
    console.error('Reject error:', error);
    req.flash('error', error.message || 'Error rejecting request');
  }
  res.redirect('/admin/requests');
});

// GET /admin/apply-behalf
router.get('/apply-behalf', async (req, res) => {
  try {
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });

    res.render('admin/apply-behalf', {
      title: 'Apply Leave on Behalf',
      employees,
      leaveTypes
    });
  } catch (error) {
    console.error('Apply behalf error:', error);
    req.flash('error', 'Error loading page');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/apply-behalf
router.post('/apply-behalf', async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;

    const request = await leaveService.createLeaveRequest({
      employeeId: parseInt(employee_id),
      leaveTypeId: parseInt(leave_type_id),
      startDate: start_date,
      endDate: end_date,
      reason,
      requestedBy: req.session.user.id
    });

    req.flash('success', 'Leave request created successfully');
    res.redirect('/admin/requests');

  } catch (error) {
    console.error('Apply behalf error:', error);
    req.flash('error', error.message || 'Error creating leave request');
    res.redirect('/admin/apply-behalf');
  }
});

// GET /admin/entitlements
router.get('/entitlements', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || getCurrentYear();
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
    const balanceReport = await reportService.generateBalanceReport(year);

    res.render('admin/entitlements', {
      title: 'Manage Entitlements',
      employees,
      leaveTypes,
      balanceReport,
      year,
      currentYear: getCurrentYear()
    });
  } catch (error) {
    console.error('Entitlements error:', error);
    req.flash('error', 'Error loading entitlements');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/entitlements/add
router.post('/entitlements/add', async (req, res) => {
  try {
    const { employee_ids, leave_type_id, days, reason, apply_to_all } = req.body;
    const year = getCurrentYear();

    let employeeIds = [];
    if (apply_to_all === 'on') {
      const employees = await Employee.findAll({ where: { is_active: true } });
      employeeIds = employees.map(e => e.id);
    } else {
      employeeIds = Array.isArray(employee_ids) ? employee_ids.map(id => parseInt(id)) : [parseInt(employee_ids)];
    }

    await leaveService.addEntitlement({
      employeeIds,
      leaveTypeId: parseInt(leave_type_id),
      days: parseFloat(days),
      reason,
      createdBy: req.session.user.id,
      year
    });

    req.flash('success', `Successfully added ${days} days to ${employeeIds.length} employee(s)`);
    res.redirect('/admin/entitlements');

  } catch (error) {
    console.error('Add entitlement error:', error);
    req.flash('error', error.message || 'Error adding entitlement');
    res.redirect('/admin/entitlements');
  }
});

// POST /admin/entitlements/remove
router.post('/entitlements/remove', async (req, res) => {
  try {
    const { employee_id, leave_type_id, days, reason } = req.body;
    const year = getCurrentYear();

    await leaveService.removeEntitlement({
      employeeIds: [parseInt(employee_id)],
      leaveTypeId: parseInt(leave_type_id),
      days: parseFloat(days),
      reason,
      createdBy: req.session.user.id,
      year
    });

    req.flash('success', `Successfully removed ${days} days from employee`);
    res.redirect('/admin/entitlements');

  } catch (error) {
    console.error('Remove entitlement error:', error);
    req.flash('error', error.message || 'Error removing entitlement');
    res.redirect('/admin/entitlements');
  }
});

// POST /admin/entitlements/rebalance
router.post('/entitlements/rebalance', async (req, res) => {
  try {
    const year = getCurrentYear();
    const results = await leaveService.rebalanceAllEntitlements(req.session.user.id, year);

    if (results.changes.length === 0) {
      req.flash('info', `Rebalance complete. All ${results.processed} employees already have correct entitlements.`);
    } else {
      const summary = results.changes.map(c =>
        `${c.employeeName}: ${c.leaveType} ${c.from} → ${c.to} (${c.diff > 0 ? '+' : ''}${c.diff})`
      ).join(', ');

      req.flash('success', `Rebalance complete! ${results.changes.length} changes made for ${results.processed} employees. Changes: ${summary}`);
    }

    if (results.errors.length > 0) {
      req.flash('warning', `${results.errors.length} errors occurred: ${results.errors.map(e => e.employeeName).join(', ')}`);
    }

    res.redirect('/admin/entitlements');

  } catch (error) {
    console.error('Rebalance error:', error);
    req.flash('error', error.message || 'Error rebalancing entitlements');
    res.redirect('/admin/entitlements');
  }
});

// GET /admin/calendar
router.get('/calendar', async (req, res) => {
  try {
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    res.render('admin/calendar', {
      title: 'Team Calendar',
      employees
    });
  } catch (error) {
    console.error('Calendar error:', error);
    req.flash('error', 'Error loading calendar');
    res.redirect('/admin/dashboard');
  }
});

// API: Get calendar events for admin
router.get('/api/calendar', async (req, res) => {
  try {
    const { start, end, employee_id } = req.query;
    const employeeId = employee_id ? parseInt(employee_id) : null;
    const leaves = await leaveService.getLeavesForCalendar(start, end, employeeId);

    const events = leaves.map(leave => ({
      id: leave.id,
      title: `${leave.employee.first_name} ${leave.employee.last_name} - ${leave.leaveType.name}`,
      start: leave.start_date,
      end: new Date(new Date(leave.end_date).getTime() + 86400000).toISOString().split('T')[0],
      color: leave.status === 'approved' ? '#28a745' : '#ffc107',
      extendedProps: {
        status: leave.status,
        employee: `${leave.employee.first_name} ${leave.employee.last_name}`,
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

// GET /admin/reports
router.get('/reports', async (req, res) => {
  try {
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
    const departments = await Employee.findAll({
      attributes: ['department'],
      group: ['department'],
      where: { department: { [Op.ne]: null } }
    });

    res.render('admin/reports', {
      title: 'Reports',
      employees,
      leaveTypes,
      departments: departments.map(d => d.department),
      currentYear: getCurrentYear()
    });
  } catch (error) {
    console.error('Reports error:', error);
    req.flash('error', 'Error loading reports page');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/reports/generate
router.post('/reports/generate', async (req, res) => {
  try {
    const { report_type, start_date, end_date, department, employee_id, year } = req.body;
    let data, csvContent, filename;

    switch (report_type) {
      case 'summary':
        data = await reportService.generateLeaveSummary({ year: parseInt(year), department });
        csvContent = reportService.exportToCSV(data, 'summary');
        filename = `leave-summary-${year}.csv`;
        break;

      case 'detailed':
        data = await reportService.generateDetailedReport({
          startDate: start_date,
          endDate: end_date,
          department,
          employeeId: employee_id ? parseInt(employee_id) : null
        });
        csvContent = reportService.exportToCSV(data, 'detailed');
        filename = `leave-detailed-${start_date}-to-${end_date}.csv`;
        break;

      case 'balance':
        data = await reportService.generateBalanceReport(parseInt(year));
        csvContent = reportService.exportToCSV(data, 'balance');
        filename = `leave-balance-${year}.csv`;
        break;

      default:
        throw new Error('Invalid report type');
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Report generation error:', error);
    req.flash('error', error.message || 'Error generating report');
    res.redirect('/admin/reports');
  }
});

// API: Get employee balance
router.get('/api/employee-balance/:id', async (req, res) => {
  try {
    const year = getCurrentYear();
    const balances = await leaveService.getEmployeeBalances(parseInt(req.params.id), year);
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: 'Error loading balance' });
  }
});

// API: Preview balance consumption (Smart Consumption)
router.get('/api/preview-balance-consumption', async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date } = req.query;

    if (!employee_id || !leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const year = new Date(start_date).getFullYear();
    const totalDays = calculateWorkingDays(start_date, end_date);

    if (totalDays <= 0) {
      return res.json({
        success: true,
        breakdown: [],
        hasOverflow: false,
        unpaidDays: 0,
        totalDays: 0,
        message: 'No working days in selected range'
      });
    }

    const consumption = await leaveService.calculateSmartBalanceConsumption(
      parseInt(employee_id),
      parseInt(leave_type_id),
      totalDays,
      year
    );

    res.json({
      success: true,
      ...consumption,
      totalDays
    });
  } catch (error) {
    console.error('Preview balance consumption error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/historic-import - Show historic leave import form
router.get('/historic-import', async (req, res) => {
  try {
    const employees = await Employee.findAll({ where: { is_active: true }, order: [['first_name', 'ASC']] });
    const leaveTypes = await LeaveType.findAll({
      where: {
        is_active: true,
        name: { [Op.ne]: 'Unpaid Leave' } // Don't show Unpaid Leave as primary selection
      }
    });

    res.render('admin/historic-import', {
      title: 'Import Historic Leave',
      employees,
      leaveTypes
    });
  } catch (error) {
    console.error('Historic import page error:', error);
    req.flash('error', 'Error loading page');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/historic-import - Create historic leave request
router.post('/historic-import', async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason, confirmed_breakdown } = req.body;

    // Validate dates are in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDateObj = new Date(end_date);
    endDateObj.setHours(0, 0, 0, 0);

    if (endDateObj >= today) {
      req.flash('error', 'Historic leave must have end date in the past. For future leaves, use "Apply on Behalf".');
      return res.redirect('/admin/historic-import');
    }

    const totalDays = calculateWorkingDays(start_date, end_date);
    if (totalDays <= 0) {
      req.flash('error', 'No working days in the selected date range');
      return res.redirect('/admin/historic-import');
    }

    const breakdown = JSON.parse(confirmed_breakdown);

    const request = await leaveService.createHistoricLeaveRequest({
      employeeId: parseInt(employee_id),
      leaveTypeId: parseInt(leave_type_id),
      startDate: start_date,
      endDate: end_date,
      totalDays,
      reason
    }, breakdown, req.session.user.id);

    // Get employee name for message
    const employee = await Employee.findByPk(employee_id);
    const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Employee';

    // Build breakdown summary
    const breakdownSummary = breakdown.map(b => `${b.days} ${b.leaveTypeName}`).join(', ');

    req.flash('success', `Historic leave imported for ${employeeName}: ${breakdownSummary}`);
    res.redirect('/admin/requests');

  } catch (error) {
    console.error('Historic import error:', error);
    req.flash('error', error.message || 'Error importing historic leave');
    res.redirect('/admin/historic-import');
  }
});

// POST /admin/apply-behalf-smart - Apply leave with smart consumption
router.post('/apply-behalf-smart', async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason, confirmed_breakdown } = req.body;

    const totalDays = calculateWorkingDays(start_date, end_date);
    if (totalDays <= 0) {
      req.flash('error', 'No working days in the selected date range');
      return res.redirect('/admin/apply-behalf');
    }

    const breakdown = JSON.parse(confirmed_breakdown);

    const request = await leaveService.createLeaveRequestWithSmartConsumption({
      employeeId: parseInt(employee_id),
      leaveTypeId: parseInt(leave_type_id),
      startDate: start_date,
      endDate: end_date,
      totalDays,
      reason,
      requestedBy: req.session.user.id
    }, breakdown);

    // Get employee name for message
    const employee = await Employee.findByPk(employee_id);
    const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Employee';

    req.flash('success', `Leave request created for ${employeeName} (pending approval)`);
    res.redirect('/admin/requests');

  } catch (error) {
    console.error('Apply behalf smart error:', error);
    req.flash('error', error.message || 'Error creating leave request');
    res.redirect('/admin/apply-behalf');
  }
});

module.exports = router;
