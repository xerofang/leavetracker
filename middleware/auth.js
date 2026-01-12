/**
 * Authentication middleware - checks if user is logged in
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please login to continue');
  res.redirect('/login');
}

/**
 * Guest middleware - checks if user is NOT logged in
 */
function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/employee/dashboard');
  }
  next();
}

/**
 * Admin middleware - checks if user is admin
 */
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied. Admin privileges required.');
  res.redirect('/employee/dashboard');
}

/**
 * Active account middleware - checks if account is active
 */
function isActive(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_active) {
    return next();
  }
  req.session.destroy();
  req.flash('error', 'Your account has been deactivated. Please contact HR.');
  res.redirect('/login');
}

module.exports = {
  isAuthenticated,
  isGuest,
  isAdmin,
  isActive
};
