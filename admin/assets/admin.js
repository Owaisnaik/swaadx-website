(function () {
  'use strict';

  function getPublishableKey() {
    var meta = document.querySelector('meta[name="clerk-publishable-key"]');
    return meta && meta.content ? meta.content.trim() : '';
  }

  function setStatus(id, message) {
    var element = document.getElementById(id);
    if (element) element.textContent = message;
  }

  function redirect(path) {
    window.location.replace(path);
  }

  function requireClerk() {
    var key = getPublishableKey();
    if (!key) throw new Error('Admin authentication is not configured. Add the Clerk publishable key to the admin pages.');
    if (!window.Clerk) throw new Error('The Clerk browser SDK could not be loaded.');
    return window.Clerk;
  }

  async function loadClerk() {
    var clerk = requireClerk();
    await clerk.load({ standardBrowser: true });
    return clerk;
  }

  async function startGate() {
    try {
      var clerk = await loadClerk();
      redirect(clerk.session ? 'dashboard.html' : 'login.html');
    } catch (error) {
      setStatus('admin-status', error instanceof Error ? error.message : 'Unable to initialize admin authentication.');
    }
  }

  async function startLogin() {
    try {
      var clerk = await loadClerk();
      if (clerk.session) {
        redirect('dashboard.html');
        return;
      }
      clerk.mountSignIn(document.getElementById('sign-in'), {
        routing: 'hash',
        signUpUrl: '',
        afterSignInUrl: '../admin/dashboard.html',
        afterSignUpUrl: '../admin/dashboard.html'
      });
    } catch (error) {
      setStatus('login-status', error instanceof Error ? error.message : 'Unable to initialize admin login.');
    }
  }

  function setCount(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = typeof value === 'number' ? value.toLocaleString() : '—';
  }

  async function startDashboard() {
    try {
      var clerk = await loadClerk();
      if (!clerk.session) {
        redirect('login.html');
        return;
      }
      if (window.SwaadxAdminShell) window.SwaadxAdminShell.initialize();
      if (clerk.mountUserButton) clerk.mountUserButton(document.getElementById('user-button'));
      document.getElementById('logout-button').addEventListener('click', function () {
        clerk.signOut().then(function () { redirect('login.html'); });
      });
      var summary = await window.SwaadxAdminApi.getDashboardSummary();
      setCount('delivery-partners-count', summary.deliveryPartners);
      setCount('kyc-profiles-count', summary.kycProfiles);
      setCount('restaurants-count', summary.restaurants);
      setCount('orders-count', summary.orders);
      var state = document.getElementById('summary-state');
      state.textContent = 'Connected';
      state.classList.remove('status-pill--neutral');
      state.classList.add('status-pill--success');
    } catch (error) {
      if (error && error.status === 401 && window.Clerk) {
        await window.Clerk.signOut();
        redirect('login.html');
        return;
      }
      setStatus('dashboard-error', error instanceof Error ? error.message : 'Unable to load the admin dashboard.');
      var state = document.getElementById('summary-state');
      if (state) state.textContent = 'Unavailable';
    }

  }

  async function startModulePage() {
    try {
      var clerk = await loadClerk();
      if (!clerk.session) {
        redirect('login.html');
        return;
      }
      if (window.SwaadxAdminShell) window.SwaadxAdminShell.initialize();
      if (clerk.mountUserButton) clerk.mountUserButton(document.getElementById('user-button'));
      await window.SwaadxAdminApi.getMe();
      var logout = document.getElementById('logout-button');
      if (logout) {
        logout.addEventListener('click', function () {
          clerk.signOut().then(function () { redirect('login.html'); });
        });
      }
    } catch (error) {
      if (error && error.status === 401) {
        redirect('login.html');
        return;
      }
      if (error && error.status === 403 && window.Clerk) {
        await window.Clerk.signOut();
        redirect('login.html');
        return;
      }
      setStatus('page-error', error instanceof Error ? error.message : 'Unable to initialize the admin page.');
    }
  }

  window.SwaadxAdmin = {
    startGate: startGate,
    startLogin: startLogin,
    startDashboard: startDashboard,
    startModulePage: startModulePage
  };
})();
