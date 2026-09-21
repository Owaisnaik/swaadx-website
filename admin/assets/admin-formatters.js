(function () {
  'use strict';

  function number(value) {
    return typeof value === 'number' ? value.toLocaleString() : '—';
  }

  function displayName(user) {
    if (!user) return 'Administrator';
    return user.fullName || user.username || user.primaryEmailAddress || 'Administrator';
  }

  window.SwaadxAdminFormatters = {
    number: number,
    displayName: displayName
  };
})();
