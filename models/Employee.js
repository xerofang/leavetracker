const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Employee = sequelize.define('Employee', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    join_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('Active', 'Probation', 'Inactive'),
      defaultValue: 'Active'
    },
    role: {
      type: DataTypes.ENUM('employee', 'admin'),
      defaultValue: 'employee'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    leave_year_start: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    slack_user_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Slack member ID for @ mentions (e.g., U1234567890)'
    }
  }, {
    tableName: 'employees',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (employee) => {
        if (employee.password) {
          employee.password = await bcrypt.hash(employee.password, 10);
        }
      },
      beforeUpdate: async (employee) => {
        if (employee.changed('password')) {
          employee.password = await bcrypt.hash(employee.password, 10);
        }
      }
    }
  });

  Employee.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  Employee.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  return Employee;
};
