const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Holiday = sequelize.define('Holiday', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Holiday name (e.g., Diwali, Independence Day)'
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Holiday date'
    },
    country: {
      type: DataTypes.ENUM('IN', 'US'),
      allowNull: false,
      comment: 'Country code (IN=India, US=United States)'
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Year extracted from date for easy filtering'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the holiday'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'holidays',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['date', 'country'],
        name: 'unique_holiday_date_country'
      },
      {
        fields: ['year', 'country'],
        name: 'idx_holiday_year_country'
      }
    ],
    hooks: {
      beforeCreate: (holiday) => {
        // Auto-extract year from date
        if (holiday.date) {
          holiday.year = new Date(holiday.date).getFullYear();
        }
      },
      beforeUpdate: (holiday) => {
        // Update year if date changes
        if (holiday.changed('date') && holiday.date) {
          holiday.year = new Date(holiday.date).getFullYear();
        }
      }
    }
  });

  return Holiday;
};
