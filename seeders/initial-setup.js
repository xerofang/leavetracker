require('dotenv').config();
const { sequelize, Employee, LeaveType, LeaveBalance } = require('../models');

async function seed() {
  try {
    console.log('Starting database setup for Infinite Labs Digital...\n');

    // Sync database
    await sequelize.sync({ force: true });
    console.log('Database synced');

    // Create leave types - Casual (14), Sick (3), Flex (3)
    const leaveTypes = await LeaveType.bulkCreate([
      {
        name: 'Casual',
        description: 'Casual/Annual leave',
        default_days: 14,
        is_active: true
      },
      {
        name: 'Sick',
        description: 'Medical/Sick leave',
        default_days: 3,
        is_active: true
      },
      {
        name: 'Flex',
        description: 'Flexible leave',
        default_days: 3,
        is_active: true
      }
    ]);
    console.log('Leave types created:', leaveTypes.map(lt => `${lt.name} (${lt.default_days} days)`).join(', '));

    // Create admin user (CEO/HR - info@infinitelabsdigital.com)
    // Note: Password will be hashed by Employee model's beforeCreate hook
    const admin = await Employee.create({
      employee_id: 'ADMIN001',
      email: 'info@infinitelabsdigital.com',
      password: 'admin@2026',
      first_name: 'Admin',
      last_name: 'HR',
      department: 'Management',
      join_date: '2022-01-01',
      status: 'Active',
      role: 'admin',
      is_active: true,
      leave_year_start: '2026-01-01'
    });
    console.log('Admin user created:', admin.email);

    // Employee data from Infinite Labs Digital
    const employees = [
      { employee_id: 'EMP001', first_name: 'Atif', last_name: 'Darji', email: 'atif@infinitelabsdigital.com', join_date: '2022-03-01', department: 'Project Manager', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP002', first_name: 'Akash', last_name: 'Majumdar', email: 'akash@infinitelabsdigital.com', join_date: '2022-07-09', department: 'SEO Specialist', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP003', first_name: 'Sayed', last_name: 'Sourab', email: 'sourabh@infinitelabsdigital.com', join_date: '2024-01-05', department: 'Video Editor', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP004', first_name: 'Masum', last_name: '', email: 'masum@infinitelabsdigital.com', join_date: '2024-09-01', department: 'Video Editor', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP005', first_name: 'Ariyan', last_name: 'Rana', email: 'ariyan@infinitelabsdigital.com', join_date: '2024-09-02', department: 'Graphic Designer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP006', first_name: 'Kashyap', last_name: 'Raval', email: 'kashyap@infinitelabsdigital.com', join_date: '2025-01-13', department: 'Shopify Web Developer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP007', first_name: 'Twisha', last_name: 'Mishra', email: 'twisha@infinitelabsdigital.com', join_date: '2025-01-25', department: 'Email Marketer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP008', first_name: 'Deep', last_name: 'Bhalani', email: 'deep@infinitelabsdigital.com', join_date: '2025-01-13', department: '3D Artist', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP009', first_name: 'Ashish', last_name: 'Sharawat', email: 'ashish.sharawat@infinitelabsdigital.com', join_date: '2025-07-03', department: 'Performance Marketer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP010', first_name: 'Madhumitha', last_name: 'Subramanian', email: 'madhu@infinitelabsdigital.com', join_date: '2025-07-14', department: 'Creative Strategist', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP011', first_name: 'Chandan', last_name: 'Prajapat', email: 'chandan@infinitelabsdigital.com', join_date: '2025-08-15', department: 'AI Video Editor', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP012', first_name: 'Ruchir', last_name: 'Jain', email: 'ruchir@infinitelabsdigital.com', join_date: '2025-09-08', department: 'CA', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP013', first_name: 'Juhi', last_name: 'Saxena', email: 'juhi@infinitelabsdigital.com', join_date: '2025-09-29', department: 'AI Graphic | UIUX Designer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP014', first_name: 'Mohit', last_name: 'Verma', email: 'mohit@infinitelabsdigital.com', join_date: '2025-10-22', department: 'AI Engineer', status: 'Active', leave_year_start: '2026-01-01' },
      { employee_id: 'EMP015', first_name: 'Lokesh', last_name: 'Choudhury', email: 'lokesh@infinitelabsdigital.com', join_date: '2026-01-02', department: 'Performance Marketing Specialist', status: 'Probation', leave_year_start: '2026-01-02' }
    ];

    const currentYear = parseInt(process.env.CURRENT_YEAR) || 2026;

    // Pro-rata calculation function for probation employees
    function calculateProRataEntitlement(defaultDays, joinDate, probationMonths = 3) {
      const join = new Date(joinDate);
      const yearEnd = new Date(currentYear, 11, 31); // Dec 31

      // Calculate when probation ends
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

    console.log('\nCreating employees...');
    for (const empData of employees) {
      // Generate password from first name: firstname@2026
      // Note: Password will be hashed by Employee model's beforeCreate hook
      const passwordPlain = `${empData.first_name.toLowerCase()}@${currentYear}`;

      const employee = await Employee.create({
        ...empData,
        last_name: empData.last_name || empData.first_name, // Handle single name case
        password: passwordPlain,
        role: 'employee',
        is_active: true
      });

      // Create leave balances for each employee
      const isProbation = empData.status === 'Probation';

      for (const leaveType of leaveTypes) {
        // Calculate pro-rata for probation employees (3 month probation period)
        let entitledDays = leaveType.default_days;
        if (isProbation && empData.join_date) {
          entitledDays = calculateProRataEntitlement(leaveType.default_days, empData.join_date, 3);
        }

        await LeaveBalance.create({
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          year: currentYear,
          entitled_days: entitledDays,
          used_days: 0,
          pending_days: 0
        });
      }

      const proRataNote = isProbation ? ' (Pro-rata)' : '';
      console.log(`  ✓ ${empData.employee_id}: ${empData.first_name} ${empData.last_name || ''} (${empData.email}) - Password: ${passwordPlain}${proRataNote}`);
    }

    // Create balances for admin too
    for (const leaveType of leaveTypes) {
      await LeaveBalance.create({
        employee_id: admin.id,
        leave_type_id: leaveType.id,
        year: currentYear,
        entitled_days: leaveType.default_days,
        used_days: 0,
        pending_days: 0
      });
    }

    console.log('\n========================================');
    console.log('Database setup completed successfully!');
    console.log('========================================');
    console.log('\nInfinite Labs Digital - Leave Tracker');
    console.log('--------------------------------------');
    console.log(`Total Employees: ${employees.length}`);
    console.log(`Leave Types: Casual (14), Sick (3), Flex (3)`);
    console.log(`Year: ${currentYear}`);
    console.log('\nAdmin Login:');
    console.log('  Email: info@infinitelabsdigital.com');
    console.log('  Password: admin@2026');
    console.log('\nEmployee Passwords: firstname@2026 (lowercase)');
    console.log('  Example: atif@2026, akash@2026, etc.');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
