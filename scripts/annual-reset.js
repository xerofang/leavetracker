/**
 * Annual Balance Reset Script
 * Run this on January 1st to reset leave balances for the new year
 * Usage: npm run reset-year
 */

require('dotenv').config();
const { sequelize, Employee, LeaveType, LeaveBalance } = require('../models');

async function resetYearlyBalances() {
  try {
    console.log('Starting annual leave balance reset...\n');

    const newYear = new Date().getFullYear();
    console.log(`Setting up balances for year: ${newYear}`);

    // Get all active employees
    const employees = await Employee.findAll({ where: { is_active: true } });
    console.log(`Found ${employees.length} active employees`);

    // Get all active leave types
    const leaveTypes = await LeaveType.findAll({ where: { is_active: true } });
    console.log(`Found ${leaveTypes.length} leave types\n`);

    let created = 0;
    let skipped = 0;

    for (const employee of employees) {
      for (const leaveType of leaveTypes) {
        // Check if balance already exists for this year
        const existing = await LeaveBalance.findOne({
          where: {
            employee_id: employee.id,
            leave_type_id: leaveType.id,
            year: newYear
          }
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create new balance
        await LeaveBalance.create({
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          year: newYear,
          entitled_days: leaveType.default_days,
          used_days: 0,
          pending_days: 0
        });
        created++;
      }
      process.stdout.write('.');
    }

    console.log('\n');
    console.log('========================================');
    console.log('Annual reset completed!');
    console.log('========================================');
    console.log(`Balances created: ${created}`);
    console.log(`Balances skipped (already exist): ${skipped}`);
    console.log(`Year: ${newYear}`);

    process.exit(0);
  } catch (error) {
    console.error('Reset error:', error);
    process.exit(1);
  }
}

resetYearlyBalances();
