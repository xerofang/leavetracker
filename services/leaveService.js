const { LeaveBalance, LeaveRequest, LeaveType, LeaveEntitlementLog, Employee } = require('../models');
const { calculateWorkingDays, getCurrentYear } = require('../utils/dateUtils');
const { Op } = require('sequelize');

/**
 * Get or create leave balance for an employee
 */
async function getOrCreateBalance(employeeId, leaveTypeId, year = getCurrentYear()) {
  let balance = await LeaveBalance.findOne({
    where: { employee_id: employeeId, leave_type_id: leaveTypeId, year }
  });

  if (!balance) {
    const leaveType = await LeaveType.findByPk(leaveTypeId);
    balance = await LeaveBalance.create({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      entitled_days: leaveType ? leaveType.default_days : 0,
      used_days: 0,
      pending_days: 0
    });
  }

  return balance;
}

/**
 * Get all balances for an employee
 */
async function getEmployeeBalances(employeeId, year = getCurrentYear()) {
  const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
  const balances = [];

  for (const leaveType of leaveTypes) {
    const balance = await getOrCreateBalance(employeeId, leaveType.id, year);
    balances.push({
      leaveType,
      balance,
      available: balance.getAvailableDays()
    });
  }

  return balances;
}

/**
 * Check if employee can apply for leave
 */
async function canApplyLeave(employeeId, leaveTypeId, totalDays, year = getCurrentYear()) {
  const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
  const available = balance.getAvailableDays();
  return {
    canApply: available >= totalDays,
    available,
    requested: totalDays,
    shortage: Math.max(0, totalDays - available)
  };
}

/**
 * Create a new leave request
 */
async function createLeaveRequest(data) {
  const { employeeId, leaveTypeId, startDate, endDate, reason, requestedBy } = data;
  const year = new Date(startDate).getFullYear();
  const totalDays = calculateWorkingDays(startDate, endDate);

  // Check balance
  const checkResult = await canApplyLeave(employeeId, leaveTypeId, totalDays, year);
  if (!checkResult.canApply) {
    throw new Error(`Insufficient leave balance. Available: ${checkResult.available}, Requested: ${checkResult.requested}`);
  }

  // Create request
  const request = await LeaveRequest.create({
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    total_days: totalDays,
    reason,
    status: 'pending',
    requested_by: requestedBy || employeeId
  });

  // Update pending days in balance
  const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
  await balance.update({
    pending_days: parseFloat(balance.pending_days) + totalDays
  });

  return request;
}

/**
 * Approve a leave request
 */
async function approveLeaveRequest(requestId, adminId, remarks = '') {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.status !== 'pending') throw new Error('Only pending requests can be approved');

  const year = new Date(request.start_date).getFullYear();
  const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);

  // Move days from pending to used
  await balance.update({
    pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days)),
    used_days: parseFloat(balance.used_days) + parseFloat(request.total_days)
  });

  // Update request status
  await request.update({
    status: 'approved',
    approved_by: adminId,
    admin_remarks: remarks
  });

  return request;
}

/**
 * Reject a leave request
 */
async function rejectLeaveRequest(requestId, adminId, remarks = '') {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.status !== 'pending') throw new Error('Only pending requests can be rejected');

  const year = new Date(request.start_date).getFullYear();
  const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);

  // Return pending days
  await balance.update({
    pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days))
  });

  // Update request status
  await request.update({
    status: 'rejected',
    approved_by: adminId,
    admin_remarks: remarks
  });

  return request;
}

/**
 * Cancel a leave request
 */
async function cancelLeaveRequest(requestId, employeeId) {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.employee_id !== employeeId) throw new Error('You can only cancel your own requests');
  if (request.status !== 'pending') throw new Error('Only pending requests can be cancelled');

  const year = new Date(request.start_date).getFullYear();
  const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);

  // Return pending days
  await balance.update({
    pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days))
  });

  await request.update({ status: 'cancelled' });

  return request;
}

/**
 * Add entitlement to employee(s)
 */
async function addEntitlement(data) {
  const { employeeIds, leaveTypeId, days, reason, createdBy, year = getCurrentYear() } = data;

  const results = [];
  for (const employeeId of employeeIds) {
    const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
    await balance.update({
      entitled_days: parseFloat(balance.entitled_days) + parseFloat(days)
    });

    // Log the entitlement
    await LeaveEntitlementLog.create({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      days_added: days,
      reason,
      created_by: createdBy
    });

    results.push({ employeeId, newEntitlement: balance.entitled_days });
  }

  return results;
}

/**
 * Remove/reduce entitlement from employee(s)
 */
async function removeEntitlement(data) {
  const { employeeIds, leaveTypeId, days, reason, createdBy, year = getCurrentYear() } = data;

  const results = [];
  for (const employeeId of employeeIds) {
    const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
    const currentEntitled = parseFloat(balance.entitled_days);
    const usedDays = parseFloat(balance.used_days);
    const pendingDays = parseFloat(balance.pending_days);
    const daysToRemove = parseFloat(days);

    // Check if we can remove this many days
    const minRequired = usedDays + pendingDays;
    const newEntitled = currentEntitled - daysToRemove;

    if (newEntitled < minRequired) {
      throw new Error(`Cannot reduce entitlement below ${minRequired} days (used: ${usedDays}, pending: ${pendingDays}) for employee ID ${employeeId}`);
    }

    if (newEntitled < 0) {
      throw new Error(`Cannot reduce entitlement below 0 for employee ID ${employeeId}`);
    }

    await balance.update({
      entitled_days: newEntitled
    });

    // Log the removal (negative days)
    await LeaveEntitlementLog.create({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      days_added: -daysToRemove,
      reason: reason || 'Entitlement reduction',
      created_by: createdBy
    });

    results.push({ employeeId, newEntitlement: newEntitled });
  }

  return results;
}

/**
 * Calculate pro-rata entitlement for probation employees
 * @param {number} defaultDays - Full year entitlement
 * @param {Date|string} joinDate - Employee join date
 * @param {number} probationMonths - Probation period in months (default 3)
 * @returns {number} Pro-rata days rounded to nearest 0.5
 */
function calculateProRataEntitlement(defaultDays, joinDate, probationMonths = 3) {
  const join = new Date(joinDate);
  const year = getCurrentYear();
  const yearEnd = new Date(year, 11, 31); // Dec 31

  // Calculate months remaining in the year after probation ends
  const probationEndDate = new Date(join);
  probationEndDate.setMonth(probationEndDate.getMonth() + probationMonths);

  // If probation ends after year end, no entitlement for this year
  if (probationEndDate > yearEnd) {
    return 0;
  }

  // Calculate remaining months from probation end to year end
  const remainingMonths = (yearEnd.getMonth() - probationEndDate.getMonth()) +
                          (yearEnd.getFullYear() - probationEndDate.getFullYear()) * 12 + 1;

  // Pro-rata: (defaultDays / 12) * remainingMonths
  const proRataDays = (defaultDays / 12) * Math.max(0, remainingMonths);

  // Round to nearest 0.5
  return Math.round(proRataDays * 2) / 2;
}

/**
 * Get pending requests for admin
 */
async function getPendingRequests() {
  return LeaveRequest.findAll({
    where: { status: 'pending' },
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'email', 'department'] },
      { model: LeaveType, as: 'leaveType', attributes: ['id', 'name'] }
    ],
    order: [['created_at', 'ASC']]
  });
}

/**
 * Get all requests with filters
 */
async function getAllRequests(filters = {}) {
  const where = {};

  if (filters.status) where.status = filters.status;
  if (filters.employeeId) where.employee_id = filters.employeeId;
  if (filters.leaveTypeId) where.leave_type_id = filters.leaveTypeId;
  if (filters.startDate && filters.endDate) {
    where.start_date = { [Op.between]: [filters.startDate, filters.endDate] };
  }

  return LeaveRequest.findAll({
    where,
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'email', 'department'] },
      { model: LeaveType, as: 'leaveType', attributes: ['id', 'name'] },
      { model: Employee, as: 'approvedBy', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['created_at', 'DESC']]
  });
}

/**
 * Get employee's leave requests
 */
async function getEmployeeRequests(employeeId, year = null) {
  const where = { employee_id: employeeId };

  if (year) {
    where.start_date = {
      [Op.between]: [`${year}-01-01`, `${year}-12-31`]
    };
  }

  return LeaveRequest.findAll({
    where,
    include: [
      { model: LeaveType, as: 'leaveType', attributes: ['id', 'name'] },
      { model: Employee, as: 'approvedBy', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['created_at', 'DESC']]
  });
}

/**
 * Get leaves for calendar (approved + pending)
 */
async function getLeavesForCalendar(startDate, endDate, employeeId = null) {
  const where = {
    status: { [Op.in]: ['approved', 'pending'] },
    [Op.or]: [
      { start_date: { [Op.between]: [startDate, endDate] } },
      { end_date: { [Op.between]: [startDate, endDate] } },
      {
        [Op.and]: [
          { start_date: { [Op.lte]: startDate } },
          { end_date: { [Op.gte]: endDate } }
        ]
      }
    ]
  };

  if (employeeId) where.employee_id = employeeId;

  return LeaveRequest.findAll({
    where,
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name'] },
      { model: LeaveType, as: 'leaveType', attributes: ['id', 'name'] }
    ]
  });
}

/**
 * Reset balances for new year
 */
async function resetYearlyBalances(newYear) {
  const employees = await Employee.findAll({ where: { is_active: true } });
  const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });

  for (const employee of employees) {
    for (const leaveType of leaveTypes) {
      await LeaveBalance.create({
        employee_id: employee.id,
        leave_type_id: leaveType.id,
        year: newYear,
        entitled_days: leaveType.default_days,
        used_days: 0,
        pending_days: 0
      });
    }
  }

  return { employeesProcessed: employees.length, leaveTypesProcessed: leaveTypes.length };
}

module.exports = {
  getOrCreateBalance,
  getEmployeeBalances,
  canApplyLeave,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  addEntitlement,
  removeEntitlement,
  calculateProRataEntitlement,
  getPendingRequests,
  getAllRequests,
  getEmployeeRequests,
  getLeavesForCalendar,
  resetYearlyBalances
};
