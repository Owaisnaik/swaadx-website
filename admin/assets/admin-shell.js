(function () {
  'use strict';

  var navigation = [
    { label: 'Dashboard', href: 'dashboard.html', key: 'dashboard' },
    { label: 'Delivery Partners', key: 'delivery-partners', children: [
      { label: 'Applications', href: 'delivery-partners/applications.html' },
      { label: 'All Partners', href: 'delivery-partners/index.html' },
      { label: 'KYC Reviews', href: 'kyc/index.html' },
      { label: 'Payment Details', href: 'payment-details/index.html' },
      { label: 'Suspended', href: 'delivery-partners/suspended.html' }
    ] },
    { label: 'Restaurants', key: 'restaurants', children: [
      { label: 'Applications', href: 'restaurants/applications.html' },
      { label: 'All Restaurants', href: 'restaurants/index.html' },
      { label: 'Menus', href: 'restaurants/menus.html' },
      { label: 'Content Moderation', href: 'restaurants/moderation.html' },
      { label: 'Suspended', href: 'restaurants/suspended.html' }
    ] },
    { label: 'Orders', key: 'orders', children: [
      { label: 'All Orders', href: 'orders/index.html' },
      { label: 'Active', href: 'orders/active.html' },
      { label: 'Completed', href: 'orders/completed.html' },
      { label: 'Cancelled', href: 'orders/cancelled.html' }
    ] },
    { label: 'Payments', href: 'payments/index.html', key: 'payments' },
    { label: 'Earnings', href: 'earnings/index.html', key: 'earnings' },
    { label: 'Payouts', href: 'payouts/index.html', key: 'payouts' },
    { label: 'Reviews / Reports', href: 'reviews/index.html', key: 'reviews' },
    { label: 'Audit Log', href: 'audit/index.html', key: 'audit' },
    { label: 'Settings', href: 'settings/index.html', key: 'settings' }
  ];

  function link(root, item) {
    var anchor = document.createElement('a');
    anchor.className = 'admin-nav-link';
    anchor.href = root + item.href;
    anchor.textContent = item.label;
    return anchor;
  }

  function buildNavigation(root, active) {
    var nav = document.createElement('nav');
    nav.className = 'admin-nav';
    nav.setAttribute('aria-label', 'Admin navigation');
    navigation.forEach(function (item) {
      var group = document.createElement('div');
      group.className = 'admin-nav-group';
      if (item.children) {
        var heading = document.createElement('div');
        heading.className = 'admin-nav-heading';
        heading.textContent = item.label;
        group.appendChild(heading);
        item.children.forEach(function (child) {
          var childLink = link(root, child);
          if (active === item.key) childLink.classList.add('admin-nav-link--active');
          group.appendChild(childLink);
        });
      } else {
        var itemLink = link(root, item);
        if (active === item.key) itemLink.classList.add('admin-nav-link--active');
        group.appendChild(itemLink);
      }
      nav.appendChild(group);
    });
    return nav;
  }

  function initialize(options) {
    var body = document.body;
    var root = body.getAttribute('data-admin-root') || '';
    var active = body.getAttribute('data-admin-section') || 'dashboard';
    var title = body.getAttribute('data-admin-title') || 'Admin';
    var sidebar = document.createElement('aside');
    sidebar.className = 'admin-sidebar';
    sidebar.id = 'admin-sidebar';
    var brand = document.createElement('a');
    brand.className = 'brand admin-sidebar-brand';
    brand.href = root + 'dashboard.html';
    brand.appendChild(document.createTextNode('SWAA'));
    var brandAccent = document.createElement('span');
    brandAccent.textContent = 'DX';
    brand.appendChild(brandAccent);
    brand.appendChild(document.createTextNode(' '));
    var brandLabel = document.createElement('small');
    brandLabel.textContent = 'ADMIN';
    brand.appendChild(brandLabel);
    sidebar.appendChild(brand);
    sidebar.appendChild(buildNavigation(root, active));

    var overlay = document.createElement('button');
    overlay.className = 'admin-sidebar-overlay';
    overlay.type = 'button';
    overlay.setAttribute('aria-label', 'Close navigation');
    overlay.addEventListener('click', closeSidebar);
    body.appendChild(overlay);

    var shell = document.createElement('div');
    shell.className = 'admin-layout';
    body.insertBefore(shell, body.firstChild);
    shell.appendChild(sidebar);

    var content = document.createElement('div');
    content.className = 'admin-content';
    shell.appendChild(content);
    var header = document.createElement('header');
    header.className = 'admin-header';
    var menuButton = document.createElement('button');
    menuButton.className = 'admin-menu-button';
    menuButton.type = 'button';
    menuButton.textContent = 'Menu';
    menuButton.addEventListener('click', openSidebar);
    header.appendChild(menuButton);
    var heading = document.createElement('div');
    heading.className = 'admin-header-title';
    heading.textContent = title;
    header.appendChild(heading);
    var actions = document.createElement('div');
    actions.className = 'header-actions';
    var userButton = document.createElement('div');
    userButton.className = 'user-button';
    userButton.id = 'user-button';
    actions.appendChild(userButton);
    var logout = document.createElement('button');
    logout.className = 'button button--quiet';
    logout.type = 'button';
    logout.id = 'logout-button';
    logout.textContent = 'Sign out';
    actions.appendChild(logout);
    header.appendChild(actions);
    content.appendChild(header);
    var main = body.querySelector('[data-admin-content]');
    if (main) {
      content.appendChild(main);
    }
    if (options && typeof options.onReady === 'function') options.onReady();
    return { sidebar: sidebar, content: content };
  }

  function openSidebar() {
    document.body.classList.add('admin-sidebar-open');
  }

  function closeSidebar() {
    document.body.classList.remove('admin-sidebar-open');
  }

  window.SwaadxAdminShell = {
    initialize: initialize,
    openSidebar: openSidebar,
    closeSidebar: closeSidebar,
    navigation: navigation
  };
})();
