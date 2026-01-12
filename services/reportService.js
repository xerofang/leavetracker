const { createObjectCsvStringifier } = require('csv-writer');
const { Employee, LeaveRequest, LeaveType, LeaveBalance } = require('../models');
const { Op } = require('sequelize');
const { getCurrentYear } = require('../utils/dateUtils');

/**
 * Generate leave summary report
 */
async function generateLeaveSummary(filters = {}) {
  const year = filters.year || getCurrentYear();
  const where = {};

  if (filters.department) {
    where['$employee.department$'] = filters.department;
  }

  const requests = await LeaveRequest.findAll({
    where: {
      status: 'approved',
      start_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] }
    },
    include: [
      { model: Employee, as: 'employee', where: filters.department ? { department: filters.department } : {} },
      { model: LeaveType, as: 'leaveType' }
    ]
  });

  // Group by employee
  const summary = {};
  for (const request of requests) {
    const empId = request.employee_id;
    if (!summary[empId]) {
      summary[empId] = {
        employee: request.employee,
        leaves: {},
        totalDays: 0
      };
    }

    const leaveTypeName = request.leaveType.name;
    if (!summary[empId].leaves[leaveTypeName]) {
      summary[empId].leaves[leaveTypeName] = 0;
    }
    summary[empId].leaves[leaveTypeName] += parseFloat(request.total_days);
    summary[empId].totalDays += parseFloat(request.total_days);
  }

  return Object.values(summary);
}

/**
 * Generate detailed leave report
 */
async function generateDetailedReport(filters = {}) {
  const where = { status: 'approved' };

  if (filters.startDate && filters.endDate) {
    where.start_date = { [Op.between]: [filters.startDate, filters.endDate] };
  }

  if (filters.leaveTypeId) {
    where.leave_type_id = filters.leaveTypeId;
  }

  const employeeWhere = {};
  if (filters.department) {
    employeeWhere.department = filters.department;
  }
  if (filters.employeeId) {
    employeeWhere.id = filters.employeeId;
  }

  return LeaveRequest.findAll({
    where,
    include: [
      { model: Employee, as: 'employee', where: Object.keys(employeeWhere).length ? employeeWhere : undefined },
      { model: LeaveType, as: 'leaveType' },
      { model: Employee, as: 'approvedBy' }
    ],
    order: [['start_date', 'ASC']]
  });
}

/**
 * Generate balance report
 */
async function generateBalanceReport(year = getCurrentYear()) {
  const employees = await Employee.findAll({
    where: { is_active: true },
    include: [{
      model: LeaveBalance,
      as: 'balances',
      where: { year },
      required: false,
      include: [{ model: LeaveType, as: 'leaveType' }]
    }],
    order: [['first_name', 'ASC']]
  });

  return employees.map(emp => ({
    employee: {
      id: emp.id,
      name: `${emp.first_name} ${emp.last_name}`,
      email: emp.email,
      department: emp.department
    },
    balances: emp.balances.map(bal => ({
      leaveType: bal.leaveType.name,
      entitled: parseFloat(bal.entitled_days),
      used: parseFloat(bal.used_days),
      pending: parseFloat(bal.pending_days),
      available: parseFloat(bal.entitled_days) - parseFloat(bal.used_days) - parseFloat(bal.pending_days)
    }))
  }));
}

/**
 * Export to CSV string
 */
function exportToCSV(data, type) {
  let headers, records;

  switch (type) {
    case 'summary':
      headers = [
        { id: 'name', title: 'Employee Name' },
        { id: 'department', title: 'Department' },
        { id: 'casual', title: 'Casual Leave' },
        { id: 'sick', title: 'Sick Leave' },
        { id: 'flex', title: 'Flex Leave' },
        { id: 'total', title: 'Total Days' }
      ];
      records = data.map(item => ({
        name: `${item.employee.first_name} ${item.employee.last_name}`,
        department: item.employee.department || 'N/A',
        casual: item.leaves['Casual'] || 0,
        sick: item.leaves['Sick'] || 0,
        flex: item.leaves['Flex'] || 0,
        total: item.totalDays
      }));
      break;

    case 'detailed':
      headers = [
        { id: 'employee', title: 'Employee' },
        { id: 'department', title: 'Department' },
        { id: 'leaveType', title: 'Leave Type' },
        { id: 'startDate', title: 'Start Date' },
        { id: 'endDate', title: 'End Date' },
        { id: 'days', title: 'Days' },
        { id: 'reason', title: 'Reason' },
        { id: 'status', title: 'Status' },
        { id: 'requestDate', title: 'Request Date' },
        { id: 'approvalDate', title: 'Approval/Action Date' },
        { id: 'approvedBy', title: 'Approved By' },
        { id: 'adminRemarks', title: 'Admin Remarks' }
      ];
      records = data.map(item => ({
        employee: `${item.employee.first_name} ${item.employee.last_name}`,
        department: item.employee.department || 'N/A',
        leaveType: item.leaveType.name,
        startDate: item.start_date,
        endDate: item.end_date,
        days: item.total_days,
        reason: item.reason || '',
        status: item.status,
        requestDate: item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : 'N/A',
        approvalDate: item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : 'N/A',
        approvedBy: item.approvedBy ? `${item.approvedBy.first_name} ${item.approvedBy.last_name}` : 'N/A',
        adminRemarks: item.admin_remarks || ''
      }));
      break;

    case 'balance':
      headers = [
        { id: 'name', title: 'Employee Name' },
        { id: 'email', title: 'Email' },
        { id: 'department', title: 'Department' },
        { id: 'leaveType', title: 'Leave Type' },
        { id: 'entitled', title: 'Entitled' },
        { id: 'used', title: 'Used' },
        { id: 'pending', title: 'Pending' },
        { id: 'available', title: 'Available' }
      ];
      records = [];
      data.forEach(item => {
        item.balances.forEach(bal => {
          records.push({
            name: item.employee.name,
            email: item.employee.email,
            department: item.employee.department || 'N/A',
            leaveType: bal.leaveType,
            entitled: bal.entitled,
            used: bal.used,
            pending: bal.pending,
            available: bal.available
          });
        });
      });
      break;

    default:
      throw new Error('Invalid report type');
  }

  const csvStringifier = createObjectCsvStringifier({ header: headers });
  return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
}

/**
 * Get dashboard statistics
 */
async function getDashboardStats() {
  const year = getCurrentYear();
  const today = new Date().toISOString().split('T')[0];

  const [
    totalEmployees,
    activeEmployees,
    pendingRequests,
    todayOnLeave,
    approvedThisMonth
  ] = await Promise.all([
    Employee.count(),
    Employee.count({ where: { is_active: true } }),
    LeaveRequest.count({ where: { status: 'pending' } }),
    LeaveRequest.count({
      where: {
        status: 'approved',
        start_date: { [Op.lte]: today },
        end_date: { [Op.gte]: today }
      }
    }),
    LeaveRequest.count({
      where: {
        status: 'approved',
        created_at: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    })
  ]);

  return {
    totalEmployees,
    activeEmployees,
    pendingRequests,
    todayOnLeave,
    approvedThisMonth
  };
}

module.exports = {
  generateLeaveSummary,
  generateDetailedReport,
  generateBalanceReport,
  exportToCSV,
  getDashboardStats
};
