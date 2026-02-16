// Leave Tracker - Main JavaScript

// ==================== Theme Management ====================

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
}

/**
 * Update theme toggle icons based on current theme
 */
function updateThemeIcons(isDark) {
  const lightIcon = document.getElementById('lightIcon');
  const darkIcon = document.getElementById('darkIcon');

  if (lightIcon && darkIcon) {
    lightIcon.classList.toggle('d-none', isDark);
    darkIcon.classList.toggle('d-none', !isDark);
  }
}

/**
 * Initialize theme on page load
 */
function initializeTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  updateThemeIcons(isDark);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.classList.toggle('dark', e.matches);
      updateThemeIcons(e.matches);
    }
  });
}

// ==================== Main Initialization ====================

document.addEventListener('DOMContentLoaded', function() {
  // Initialize theme
  initializeTheme();
  // Auto-dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert-dismissible');
  alerts.forEach(function(alert) {
    setTimeout(function() {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });

  // Set minimum date for date inputs to today (except historic import page)
  const isHistoricImport = window.location.pathname.includes('historic-import');
  if (!isHistoricImport) {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    const today = new Date().toISOString().split('T')[0];
    dateInputs.forEach(function(input) {
      if (input.name === 'start_date') {
        input.setAttribute('min', today);
      }
    });
  }

  // Sync end date minimum with start date (except historic import page which handles its own logic)
  if (!isHistoricImport) {
    const startDateInput = document.getElementById('start_date');
    const endDateInput = document.getElementById('end_date');

    if (startDateInput && endDateInput) {
      startDateInput.addEventListener('change', function() {
        endDateInput.setAttribute('min', this.value);
        if (endDateInput.value && endDateInput.value < this.value) {
          endDateInput.value = this.value;
        }
      });
    }
  }

  // Form validation
  const forms = document.querySelectorAll('form');
  forms.forEach(function(form) {
    form.addEventListener('submit', function(event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });

  // Confirm dialogs for dangerous actions
  const confirmButtons = document.querySelectorAll('[data-confirm]');
  confirmButtons.forEach(function(button) {
    button.addEventListener('click', function(event) {
      const message = this.getAttribute('data-confirm') || 'Are you sure?';
      if (!confirm(message)) {
        event.preventDefault();
      }
    });
  });

  // Initialize tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(function(tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Active nav link highlighting
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  navLinks.forEach(function(link) {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
});

// Utility function to format dates
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
}

// Utility function to calculate working days
function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
