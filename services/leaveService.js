const { LeaveBalance, LeaveRequest, LeaveType, LeaveEntitlementLog, Employee, sequelize } = require('../models');
const { calculateWorkingDays, getCurrentYear } = require('../utils/dateUtils');
const { Op } = require('sequelize');

// Priority order for consuming leave types (after primary type)
const LEAVE_TYPE_PRIORITY = ['Casual', 'Sick', 'Flex', 'Unpaid Leave'];

// Leave types that are standalone and should NOT be used in cascade/overflow
// When these are selected as primary, only check their own balance (no cascade)
// These are never consumed as overflow from other leave types
const STANDALONE_LEAVE_TYPES = ['Paid Leave', 'Unpaid Leave'];

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
 * Handles both single-type and multi-type consumption
 */
async function approveLeaveRequest(requestId, adminId, remarks = '') {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.status !== 'pending') throw new Error('Only pending requests can be approved');

  const year = new Date(request.start_date).getFullYear();
  const transaction = await sequelize.transaction();

  try {
    // Check if this is a multi-type request
    if (request.is_multi_type && request.balance_breakdown) {
      const breakdown = typeof request.balance_breakdown === 'string'
        ? JSON.parse(request.balance_breakdown)
        : request.balance_breakdown;

      for (const item of breakdown) {
        if (!item.isUnpaid && item.leaveTypeId) {
          const balance = await getOrCreateBalance(request.employee_id, item.leaveTypeId, year);
          await balance.update({
            pending_days: Math.max(0, parseFloat(balance.pending_days) - item.days),
            used_days: parseFloat(balance.used_days) + item.days
          }, { transaction });
        }
      }
    } else {
      // Original single-type logic
      const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);
      await balance.update({
        pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days)),
        used_days: parseFloat(balance.used_days) + parseFloat(request.total_days)
      }, { transaction });
    }

    // Update request status
    await request.update({
      status: 'approved',
      approved_by: adminId,
      admin_remarks: remarks
    }, { transaction });

    await transaction.commit();
    return request;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Reject a leave request
 * Handles both single-type and multi-type consumption
 */
async function rejectLeaveRequest(requestId, adminId, remarks = '') {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.status !== 'pending') throw new Error('Only pending requests can be rejected');

  const year = new Date(request.start_date).getFullYear();
  const transaction = await sequelize.transaction();

  try {
    // Check if this is a multi-type request
    if (request.is_multi_type && request.balance_breakdown) {
      const breakdown = typeof request.balance_breakdown === 'string'
        ? JSON.parse(request.balance_breakdown)
        : request.balance_breakdown;

      for (const item of breakdown) {
        if (!item.isUnpaid && item.leaveTypeId) {
          const balance = await getOrCreateBalance(request.employee_id, item.leaveTypeId, year);
          await balance.update({
            pending_days: Math.max(0, parseFloat(balance.pending_days) - item.days)
          }, { transaction });
        }
      }
    } else {
      // Original single-type logic
      const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);
      await balance.update({
        pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days))
      }, { transaction });
    }

    // Update request status
    await request.update({
      status: 'rejected',
      approved_by: adminId,
      admin_remarks: remarks
    }, { transaction });

    await transaction.commit();
    return request;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Cancel a leave request
 * Handles both single-type and multi-type consumption
 */
async function cancelLeaveRequest(requestId, employeeId) {
  const request = await LeaveRequest.findByPk(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.employee_id !== employeeId) throw new Error('You can only cancel your own requests');
  if (request.status !== 'pending') throw new Error('Only pending requests can be cancelled');

  const year = new Date(request.start_date).getFullYear();
  const transaction = await sequelize.transaction();

  try {
    // Check if this is a multi-type request
    if (request.is_multi_type && request.balance_breakdown) {
      const breakdown = typeof request.balance_breakdown === 'string'
        ? JSON.parse(request.balance_breakdown)
        : request.balance_breakdown;

      for (const item of breakdown) {
        if (!item.isUnpaid && item.leaveTypeId) {
          const balance = await getOrCreateBalance(request.employee_id, item.leaveTypeId, year);
          await balance.update({
            pending_days: Math.max(0, parseFloat(balance.pending_days) - item.days)
          }, { transaction });
        }
      }
    } else {
      // Original single-type logic
      const balance = await getOrCreateBalance(request.employee_id, request.leave_type_id, year);
      await balance.update({
        pending_days: Math.max(0, parseFloat(balance.pending_days) - parseFloat(request.total_days))
      }, { transaction });
    }

    await request.update({ status: 'cancelled' }, { transaction });

    await transaction.commit();
    return request;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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
 * Calculate vacation entitlement based on tenure (years of service)
 * Company Policy:
 * - Year 1 (0-2 years): 7 days
 * - Year 3 (2-4 years): 14 days
 * - Year 5+ (5+ years): 18 days
 * @param {Date|string} joinDate - Employee join date
 * @returns {number} Vacation entitlement based on tenure
 */
function calculateTenureBasedVacation(joinDate) {
  if (!joinDate) return 7; // Default to Year 1 if no join date

  const join = new Date(joinDate);
  const now = new Date();

  // Calculate years of service
  let yearsOfService = now.getFullYear() - join.getFullYear();

  // Adjust if anniversary hasn't passed this year
  const thisYearAnniversary = new Date(now.getFullYear(), join.getMonth(), join.getDate());
  if (now < thisYearAnniversary) {
    yearsOfService--;
  }

  yearsOfService = Math.max(0, yearsOfService);

  // Apply company policy
  if (yearsOfService >= 5) {
    return 18; // Year 5+: 18 days
  } else if (yearsOfService >= 2) {
    return 14; // Year 3 (2-4 years): 14 days
  } else {
    return 7; // Year 1 (0-2 years): 7 days
  }
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
 * Rebalance all employee entitlements based on company policy
 * Company Policy:
 * - Vacation: Based on tenure (7/14/18 days)
 * - Flex: 3 days for everyone
 * - Probation employees get pro-rata
 * @param {number} adminId - Admin performing the rebalance
 * @param {number} year - Year to rebalance (default: current year)
 * @returns {Object} Summary of changes made
 */
async function rebalanceAllEntitlements(adminId, year = getCurrentYear()) {
  const employees = await Employee.findAll({ where: { is_active: true } });
  const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });

  // Find leave type IDs (by name, case-insensitive)
  const vacationType = leaveTypes.find(lt =>
    lt.name.toLowerCase().includes('vacation') ||
    lt.name.toLowerCase().includes('casual') ||
    lt.name.toLowerCase().includes('annual')
  );
  const flexType = leaveTypes.find(lt =>
    lt.name.toLowerCase().includes('flex')
  );

  const results = {
    processed: 0,
    changes: [],
    errors: []
  };

  for (const employee of employees) {
    try {
      const isProbation = employee.status === 'Probation';
      const joinDate = employee.join_date;

      // Calculate correct vacation entitlement based on tenure
      if (vacationType) {
        let correctVacationDays = calculateTenureBasedVacation(joinDate);

        // Apply pro-rata for probation employees
        if (isProbation && joinDate) {
          correctVacationDays = calculateProRataEntitlement(correctVacationDays, joinDate, 3);
        }

        const vacationBalance = await getOrCreateBalance(employee.id, vacationType.id, year);
        const currentVacation = parseFloat(vacationBalance.entitled_days);
        const usedDays = parseFloat(vacationBalance.used_days);
        const pendingDays = parseFloat(vacationBalance.pending_days);

        // Ensure we don't go below used + pending
        const minRequired = usedDays + pendingDays;
        const newVacationDays = Math.max(correctVacationDays, minRequired);

        if (Math.abs(currentVacation - newVacationDays) > 0.01) {
          const diff = newVacationDays - currentVacation;

          await vacationBalance.update({ entitled_days: newVacationDays });

          // Log the change
          await LeaveEntitlementLog.create({
            employee_id: employee.id,
            leave_type_id: vacationType.id,
            year,
            days_added: diff,
            reason: `Rebalance: Tenure-based adjustment (${calculateYearsOfService(joinDate)} years of service)`,
            created_by: adminId
          });

          results.changes.push({
            employeeId: employee.id,
            employeeName: `${employee.first_name} ${employee.last_name}`,
            leaveType: vacationType.name,
            from: currentVacation,
            to: newVacationDays,
            diff: diff
          });
        }
      }

      // Set Flex to 3 days for everyone
      if (flexType) {
        let correctFlexDays = 3;

        // Apply pro-rata for probation employees
        if (isProbation && joinDate) {
          correctFlexDays = calculateProRataEntitlement(3, joinDate, 3);
        }

        const flexBalance = await getOrCreateBalance(employee.id, flexType.id, year);
        const currentFlex = parseFloat(flexBalance.entitled_days);
        const usedDays = parseFloat(flexBalance.used_days);
        const pendingDays = parseFloat(flexBalance.pending_days);

        // Ensure we don't go below used + pending
        const minRequired = usedDays + pendingDays;
        const newFlexDays = Math.max(correctFlexDays, minRequired);

        if (Math.abs(currentFlex - newFlexDays) > 0.01) {
          const diff = newFlexDays - currentFlex;

          await flexBalance.update({ entitled_days: newFlexDays });

          // Log the change
          await LeaveEntitlementLog.create({
            employee_id: employee.id,
            leave_type_id: flexType.id,
            year,
            days_added: diff,
            reason: 'Rebalance: Flex policy adjustment (3 days for all)',
            created_by: adminId
          });

          results.changes.push({
            employeeId: employee.id,
            employeeName: `${employee.first_name} ${employee.last_name}`,
            leaveType: flexType.name,
            from: currentFlex,
            to: newFlexDays,
            diff: diff
          });
        }
      }

      results.processed++;
    } catch (error) {
      results.errors.push({
        employeeId: employee.id,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Helper function to calculate years of service
 */
function calculateYearsOfService(joinDate) {
  if (!joinDate) return 0;

  const join = new Date(joinDate);
  const now = new Date();
  let years = now.getFullYear() - join.getFullYear();

  const thisYearAnniversary = new Date(now.getFullYear(), join.getMonth(), join.getDate());
  if (now < thisYearAnniversary) {
    years--;
  }

  return Math.max(0, years);
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
  // Parse and format dates to YYYY-MM-DD for MySQL DATE columns
  // FullCalendar may send dates with timezone info that can get corrupted
  const parseCalendarDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      // Handle various formats from FullCalendar
      // Replace space before timezone with + (URL encoding issue)
      const cleanedDate = dateStr.replace(/\s(\d{2}:\d{2})$/, '+$1');
      const date = new Date(cleanedDate);
      if (isNaN(date.getTime())) {
        // Try parsing just the date portion
        const datePart = dateStr.split('T')[0];
        return datePart;
      }
      return date.toISOString().split('T')[0];
    } catch (e) {
      // Fallback: extract just the date part
      const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : null;
    }
  };

  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);

  if (!start || !end) {
    console.error('Invalid calendar dates:', { startDate, endDate, parsed: { start, end } });
    return [];
  }

  const where = {
    status: { [Op.in]: ['approved', 'pending'] },
    [Op.or]: [
      { start_date: { [Op.between]: [start, end] } },
      { end_date: { [Op.between]: [start, end] } },
      {
        [Op.and]: [
          { start_date: { [Op.lte]: start } },
          { end_date: { [Op.gte]: end } }
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
 * Calculate smart balance consumption across multiple leave types
 * Priority: Primary type -> Casual -> Sick -> Flex -> Unpaid Leave
 * Note: Standalone types (Paid Leave) don't cascade - they only use their own balance
 * @param {number} employeeId
 * @param {number} primaryLeaveTypeId - The leave type user selected
 * @param {number} totalDays - Total working days requested
 * @param {number} year
 * @returns {Object} { breakdown, hasOverflow, unpaidDays, totalEntitled, totalRequested }
 */
async function calculateSmartBalanceConsumption(employeeId, primaryLeaveTypeId, totalDays, year = getCurrentYear()) {
  const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
  const balances = await getEmployeeBalances(employeeId, year);

  // Find primary type
  const primaryType = leaveTypes.find(lt => lt.id === primaryLeaveTypeId);
  if (!primaryType) {
    throw new Error('Invalid leave type selected');
  }

  // Check if primary type is a standalone type (no cascade)
  const isStandalone = STANDALONE_LEAVE_TYPES.some(
    name => name.toLowerCase() === primaryType.name.toLowerCase()
  );

  if (isStandalone) {
    // Standalone types (like Paid Leave) - no cascade, only check own balance
    const balanceInfo = balances.find(b => b.leaveType.id === primaryType.id);
    const available = balanceInfo ? parseFloat(balanceInfo.available) : 0;
    const daysToConsume = Math.min(totalDays, available);
    const shortage = totalDays - daysToConsume;

    const breakdown = [];
    if (daysToConsume > 0) {
      breakdown.push({
        leaveTypeId: primaryType.id,
        leaveTypeName: primaryType.name,
        days: daysToConsume,
        isUnpaid: false,
        available: available
      });
    }

    // If shortage, it's an error for standalone types (they don't cascade)
    if (shortage > 0) {
      return {
        breakdown,
        hasOverflow: false,
        unpaidDays: 0,
        totalEntitled: available,
        totalRequested: totalDays,
        primaryLeaveType: primaryType.name,
        insufficientBalance: true,
        shortage: shortage,
        error: `Insufficient ${primaryType.name} balance. Available: ${available}, Requested: ${totalDays}`
      };
    }

    return {
      breakdown,
      hasOverflow: false,
      unpaidDays: 0,
      totalEntitled: available,
      totalRequested: totalDays,
      primaryLeaveType: primaryType.name
    };
  }

  // Regular leave types - cascade through priority order
  // Build cascade list: primary first, then priority order (excluding standalone types)
  const sortedTypes = [primaryType];
  for (const priorityName of LEAVE_TYPE_PRIORITY) {
    if (priorityName === 'Unpaid Leave') continue; // Handle unpaid separately
    // Skip standalone types in cascade
    if (STANDALONE_LEAVE_TYPES.some(s => s.toLowerCase() === priorityName.toLowerCase())) continue;

    const type = leaveTypes.find(lt =>
      lt.name.toLowerCase() === priorityName.toLowerCase() && lt.id !== primaryLeaveTypeId
    );
    if (type) sortedTypes.push(type);
  }

  const breakdown = [];
  let remainingDays = totalDays;
  let totalEntitled = 0;
  let isFirstType = true;

  // Consume from each type in order
  for (const leaveType of sortedTypes) {
    if (remainingDays <= 0) break;

    const balanceInfo = balances.find(b => b.leaveType.id === leaveType.id);
    const available = balanceInfo ? parseFloat(balanceInfo.available) : 0;
    totalEntitled += available;

    if (available > 0) {
      const daysToConsume = Math.min(remainingDays, available);
      breakdown.push({
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        days: daysToConsume,
        isUnpaid: false,
        available: available,
        isPrimary: isFirstType
      });
      remainingDays -= daysToConsume;
    } else if (isFirstType) {
      // Always show primary type even if 0 balance (so user understands why cascade happened)
      breakdown.push({
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        days: 0,
        isUnpaid: false,
        available: 0,
        isPrimary: true,
        noBalance: true
      });
    }
    isFirstType = false;
  }

  // Any remaining days are unpaid
  const unpaidDays = remainingDays;
  if (unpaidDays > 0) {
    // Find or note the Unpaid Leave type
    const unpaidType = leaveTypes.find(lt => lt.name === 'Unpaid Leave');
    breakdown.push({
      leaveTypeId: unpaidType ? unpaidType.id : null,
      leaveTypeName: 'Unpaid Leave',
      days: unpaidDays,
      isUnpaid: true,
      available: 0
    });
  }

  return {
    breakdown,
    hasOverflow: unpaidDays > 0 || breakdown.length > 1,
    unpaidDays,
    totalEntitled,
    totalRequested: totalDays,
    primaryLeaveType: primaryType.name
  };
}

/**
 * Create a historic (backdated) leave request
 * Goes directly to 'approved' status and updates used_days
 * @param {Object} data - Request data
 * @param {Array} confirmedBreakdown - Confirmed balance breakdown
 * @param {number} adminId - Admin creating the record
 */
async function createHistoricLeaveRequest(data, confirmedBreakdown, adminId) {
  const { employeeId, leaveTypeId, startDate, endDate, totalDays, reason } = data;
  const year = new Date(startDate).getFullYear();

  const transaction = await sequelize.transaction();

  try {
    // Calculate unpaid days from breakdown
    const unpaidItem = confirmedBreakdown.find(b => b.isUnpaid);
    const unpaidDays = unpaidItem ? unpaidItem.days : 0;

    // Create request with status = 'approved' directly
    const request = await LeaveRequest.create({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason,
      status: 'approved',
      requested_by: adminId,
      approved_by: adminId,
      is_historic: true,
      is_multi_type: confirmedBreakdown.length > 1,
      balance_breakdown: confirmedBreakdown,
      unpaid_days: unpaidDays,
      admin_remarks: 'Historic leave import'
    }, { transaction });

    // Directly update used_days (skip pending) for each type in breakdown
    for (const item of confirmedBreakdown) {
      if (!item.isUnpaid && item.leaveTypeId) {
        const balance = await getOrCreateBalance(employeeId, item.leaveTypeId, year);
        await balance.update({
          used_days: parseFloat(balance.used_days) + item.days
        }, { transaction });
      }
    }

    await transaction.commit();
    return request;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Create leave request with smart balance consumption (for admin apply-on-behalf)
 * @param {Object} data - Request data
 * @param {Array} confirmedBreakdown - User-confirmed breakdown
 */
async function createLeaveRequestWithSmartConsumption(data, confirmedBreakdown) {
  const { employeeId, leaveTypeId, startDate, endDate, totalDays, reason, requestedBy } = data;
  const year = new Date(startDate).getFullYear();

  const transaction = await sequelize.transaction();

  try {
    // Calculate unpaid days from breakdown
    const unpaidItem = confirmedBreakdown.find(b => b.isUnpaid);
    const unpaidDays = unpaidItem ? unpaidItem.days : 0;

    // Create main leave request (status: pending)
    const request = await LeaveRequest.create({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason,
      status: 'pending',
      requested_by: requestedBy,
      is_multi_type: confirmedBreakdown.length > 1,
      balance_breakdown: confirmedBreakdown,
      unpaid_days: unpaidDays
    }, { transaction });

    // Update pending_days for ALL involved leave types
    for (const item of confirmedBreakdown) {
      if (!item.isUnpaid && item.leaveTypeId) {
        const balance = await getOrCreateBalance(employeeId, item.leaveTypeId, year);
        await balance.update({
          pending_days: parseFloat(balance.pending_days) + item.days
        }, { transaction });
      }
    }

    await transaction.commit();
    return request;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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
  calculateTenureBasedVacation,
  rebalanceAllEntitlements,
  getPendingRequests,
  getAllRequests,
  getEmployeeRequests,
  getLeavesForCalendar,
  resetYearlyBalances,
  // Smart consumption functions
  calculateSmartBalanceConsumption,
  createHistoricLeaveRequest,
  createLeaveRequestWithSmartConsumption
};
