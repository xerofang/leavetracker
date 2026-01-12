const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveEntitlementLog = sequelize.define('LeaveEntitlementLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'employees',
        key: 'id'
      }
    },
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'leave_types',
        key: 'id'
      }
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    days_added: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id'
      }
    }
  }, {
    tableName: 'leave_entitlement_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return LeaveEntitlementLog;
};
