const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveBalance = sequelize.define('LeaveBalance', {
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
    entitled_days: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    used_days: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    pending_days: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'leave_balances',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['employee_id', 'leave_type_id', 'year']
      }
    ]
  });

  LeaveBalance.prototype.getAvailableDays = function() {
    return parseFloat(this.entitled_days) - parseFloat(this.used_days) - parseFloat(this.pending_days);
  };

  return LeaveBalance;
};
