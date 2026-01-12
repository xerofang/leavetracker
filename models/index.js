const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool
  }
);

// Import models
const Employee = require('./Employee')(sequelize);
const LeaveType = require('./LeaveType')(sequelize);
const LeaveBalance = require('./LeaveBalance')(sequelize);
const LeaveRequest = require('./LeaveRequest')(sequelize);
const LeaveEntitlementLog = require('./LeaveEntitlementLog')(sequelize);

// Define associations
Employee.hasMany(LeaveBalance, { foreignKey: 'employee_id', as: 'balances' });
LeaveBalance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

LeaveType.hasMany(LeaveBalance, { foreignKey: 'leave_type_id', as: 'balances' });
LeaveBalance.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leaveType' });

Employee.hasMany(LeaveRequest, { foreignKey: 'employee_id', as: 'leaveRequests' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

LeaveType.hasMany(LeaveRequest, { foreignKey: 'leave_type_id', as: 'requests' });
LeaveRequest.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leaveType' });

Employee.hasMany(LeaveRequest, { foreignKey: 'requested_by', as: 'requestedLeaves' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'requested_by', as: 'requestedBy' });

Employee.hasMany(LeaveRequest, { foreignKey: 'approved_by', as: 'approvedLeaves' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'approved_by', as: 'approvedBy' });

Employee.hasMany(LeaveEntitlementLog, { foreignKey: 'employee_id', as: 'entitlementLogs' });
LeaveEntitlementLog.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

LeaveType.hasMany(LeaveEntitlementLog, { foreignKey: 'leave_type_id', as: 'logs' });
LeaveEntitlementLog.belongsTo(LeaveType, { foreignKey: 'leave_type_id', as: 'leaveType' });

Employee.hasMany(LeaveEntitlementLog, { foreignKey: 'created_by', as: 'createdEntitlements' });
LeaveEntitlementLog.belongsTo(Employee, { foreignKey: 'created_by', as: 'createdBy' });

module.exports = {
  sequelize,
  Sequelize,
  Employee,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  LeaveEntitlementLog
};
