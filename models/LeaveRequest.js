const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveRequest = sequelize.define('LeaveRequest', {
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
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    total_days: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
      defaultValue: 'pending'
    },
    admin_remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    requested_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id'
      }
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'employees',
        key: 'id'
      }
    },
    is_historic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'True if this is a backdated/historic leave import'
    },
    is_multi_type: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'True if leave consumes from multiple leave types'
    },
    balance_breakdown: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON array of {leaveTypeId, leaveTypeName, days, isUnpaid} for multi-type consumption'
    },
    unpaid_days: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Number of days that are unpaid (when all entitlements exhausted)'
    }
  }, {
    tableName: 'leave_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return LeaveRequest;
};
