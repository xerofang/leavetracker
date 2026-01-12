const express = require('express');
const router = express.Router();
const { Employee } = require('../models');
const { isGuest, isAuthenticated } = require('../middleware/auth');

// GET /login
router.get('/login', isGuest, (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

// POST /login
router.post('/login', isGuest, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash('error', 'Please enter email and password');
      return res.redirect('/login');
    }

    const employee = await Employee.findOne({ where: { email: email.toLowerCase() } });

    if (!employee) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/login');
    }

    if (!employee.is_active) {
      req.flash('error', 'Your account has been deactivated. Please contact HR.');
      return res.redirect('/login');
    }

    const isValidPassword = await employee.validatePassword(password);
    if (!isValidPassword) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/login');
    }

    // Set session
    req.session.user = {
      id: employee.id,
      email: employee.email,
      first_name: employee.first_name,
      last_name: employee.last_name,
      role: employee.role,
      is_active: employee.is_active
    };

    req.flash('success', `Welcome back, ${employee.first_name}!`);

    if (employee.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    res.redirect('/employee/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/login');
  }
});

// GET /logout
router.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

// GET /change-password
router.get('/change-password', isAuthenticated, (req, res) => {
  res.render('auth/change-password', { title: 'Change Password' });
});

// POST /change-password
router.post('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'All fields are required');
      return res.redirect('/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error', 'New passwords do not match');
      return res.redirect('/change-password');
    }

    if (newPassword.length < 6) {
      req.flash('error', 'Password must be at least 6 characters');
      return res.redirect('/change-password');
    }

    const employee = await Employee.findByPk(req.session.user.id);
    const isValid = await employee.validatePassword(currentPassword);

    if (!isValid) {
      req.flash('error', 'Current password is incorrect');
      return res.redirect('/change-password');
    }

    await employee.update({ password: newPassword });

    req.flash('success', 'Password changed successfully');
    res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/employee/dashboard');

  } catch (error) {
    console.error('Change password error:', error);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/change-password');
  }
});

module.exports = router;
