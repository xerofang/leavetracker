const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveType = sequelize.define('LeaveType', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    default_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'leave_types',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return LeaveType;
};
