(function () {
  'use strict';

  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function badge(value) {
    var span = document.createElement('span');
    span.className = 'status-pill status-pill--neutral';
    span.textContent = text(value);
    return span;
  }
  function cell(value) {
    var td = document.createElement('td');
    if (value && value.nodeType) td.appendChild(value); else td.textContent = text(value);
    return td;
  }
  function empty(container, message) {
    container.textContent = '';
    var row = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = Number(container.getAttribute('data-columns') || 1);
    td.className = 'table-empty';
    td.textContent = message;
    row.appendChild(td);
    container.appendChild(row);
  }
  function error(message) {
    var node = document.getElementById('page-error');
    if (node) node.textContent = message;
  }
  function buildRow(partner, columns) {
    var row = document.createElement('tr');
    columns.forEach(function (column) {
      var value = column.render ? column.render(partner) : partner[column.key];
      row.appendChild(cell(value));
    });
    var action = document.createElement('td');
    var view = document.createElement('a');
    view.className = 'button button--quiet table-action';
    view.href = 'partner.html?id=' + encodeURIComponent(partner.id);
    view.textContent = 'View';
    action.appendChild(view);
    row.appendChild(action);
    return row;
  }
  function renderList(data, columns) {
    var body = document.getElementById('partner-table-body');
    if (!body) return;
    body.setAttribute('data-columns', String(columns.length + 1));
    if (!data.items || !data.items.length) { empty(body, 'No delivery partners found.'); return; }
    body.textContent = '';
    data.items.forEach(function (partner) { body.appendChild(buildRow(partner, columns)); });
    var total = document.getElementById('partner-total');
    if (total) total.textContent = data.total.toLocaleString() + ' partner' + (data.total === 1 ? '' : 's');
  }
  async function startList(options) {
    try {
      var query = new URLSearchParams({ page: '1', pageSize: '50' });
      if (options.status) query.set('status', options.status);
      var data = await window.SwaadxAdminApi.getDeliveryPartners(query.toString());
      renderList(data, options.columns);
    } catch (caught) {
      error(caught.message || 'Unable to load delivery partners.');
      var body = document.getElementById('partner-table-body');
      if (body) empty(body, 'Unable to load delivery partners.');
    }
  }
  function standardColumns(includeApplication) {
    var columns = [
      { key: 'fullName', render: function (p) { return text(p.fullName) + ' (' + text(p.id).slice(0, 8) + ')'; } },
      { key: 'phone' },
      { key: 'vehicleType', render: function (p) { return text(p.vehicleType) + (p.vehicleRegistrationNumber ? ' · ' + p.vehicleRegistrationNumber : ''); } },
      { key: 'status', render: function (p) { return badge(p.status); } },
      { key: 'isOnline', render: function (p) { return badge(p.isOnline ? 'Online' : 'Offline'); } }
    ];
    if (includeApplication) {
      columns.push({ key: 'applicationSubmittedAt', render: function (p) { return date(p.applicationSubmittedAt); } });
      columns.push({ key: 'onboardingCompletedAt', render: function (p) { return p.onboardingCompletedAt ? date(p.onboardingCompletedAt) : 'Not completed'; } });
    } else {
      columns.push({ key: 'applicationSubmittedAt', render: function (p) { return date(p.applicationSubmittedAt); } });
      columns.push({ key: 'onboardingCompletedAt', render: function (p) { return p.onboardingCompletedAt ? 'Complete' : 'Pending'; } });
    }
    return columns;
  }
  async function startPartnerDetail() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { error('A delivery partner ID is required.'); return; }
    try {
      var partner = await window.SwaadxAdminApi.getDeliveryPartner(id);
      var fields = {
        'Full name': partner.fullName, 'Partner ID': partner.id, 'Clerk user ID': partner.clerkUserId,
        'Phone': partner.phone, 'Email': partner.email, 'Status': partner.status,
        'Online': partner.isOnline ? 'Online' : 'Offline', 'Created': date(partner.createdAt),
        'Application submitted': date(partner.applicationSubmittedAt), 'Onboarding completed': date(partner.onboardingCompletedAt),
        'Address': partner.address, 'Date of birth': partner.dateOfBirth,
        'Vehicle type': partner.vehicleType, 'Registration': partner.vehicleRegistrationNumber,
        'Driving licence': partner.drivingLicenseNumber, 'Licence expiry': partner.drivingLicenseExpiry,
        'RC number': partner.rcNumber
      };
      Object.keys(fields).forEach(function (key) {
        var node = document.querySelector('[data-field="' + key + '"]');
        if (node) node.textContent = text(fields[key]);
      });
      await Promise.all([loadDeliveries(id), loadEarnings(id), loadPayoutMethods(id), loadPayouts(id)]);
    } catch (caught) { error(caught.message || 'Unable to load the delivery partner.'); }
  }
  async function loadDeliveries(id) {
    var body = document.getElementById('deliveries-body');
    try {
      var data = await window.SwaadxAdminApi.getPartnerDeliveries(id, 'page=1&pageSize=20');
      if (!data.items.length) { empty(body, 'No delivery activity found.'); return; }
      body.textContent = '';
      data.items.forEach(function (item) {
        var row = document.createElement('tr');
        [item.id, item.orderNumber || item.orderId, badge(item.status), date(item.assignedAt), date(item.pickedUpAt), date(item.deliveredAt)].forEach(function (value) { row.appendChild(cell(value)); });
        body.appendChild(row);
      });
    } catch (caught) { empty(body, 'Unable to load delivery activity.'); }
  }
  async function loadEarnings(id) {
    var body = document.getElementById('earnings-body');
    try {
      var data = await window.SwaadxAdminApi.getPartnerEarnings(id, 'page=1&pageSize=20');
      var total = document.getElementById('earnings-total');
      if (total) total.textContent = 'Page total: ₹' + Number(data.pageTotalAmount || 0).toFixed(2);
      if (!data.items.length) { empty(body, 'No earnings found.'); return; }
      body.textContent = '';
      data.items.forEach(function (item) {
        var row = document.createElement('tr');
        [item.deliveryId, '₹' + Number(item.amount).toFixed(2), badge(item.status), date(item.createdAt)].forEach(function (value) { row.appendChild(cell(value)); });
        body.appendChild(row);
      });
    } catch (caught) { empty(body, 'Unable to load earnings.'); }
  }
  async function loadPayoutMethods(id) {
    var container = document.getElementById('payout-methods');
    try {
      var methods = await window.SwaadxAdminApi.getPayoutMethods(id);
      if (!methods.length) { container.textContent = 'No payout methods found.'; return; }
      container.textContent = '';
      methods.forEach(function (method) {
        var item = document.createElement('article');
        item.className = 'detail-item';
        var title = document.createElement('strong');
        title.textContent = method.methodType === 'bank_account' ? 'Bank account' : 'UPI';
        item.appendChild(title);
        var details = [method.accountHolderName, method.bankName, method.ifsc, method.accountLast4 ? '•••• ' + method.accountLast4 : method.maskedUpi, method.isDefault ? 'Default' : '', method.status, method.verifiedAt ? 'Verified ' + date(method.verifiedAt) : ''].filter(Boolean);
        var paragraph = document.createElement('p');
        paragraph.textContent = details.join(' · ');
        item.appendChild(paragraph);
        container.appendChild(item);
      });
    } catch (caught) { container.textContent = 'Unable to load payout methods.'; }
  }
  async function loadPayouts(id) {
    var body = document.getElementById('payouts-body');
    try {
      var data = await window.SwaadxAdminApi.getPartnerPayouts(id, 'page=1&pageSize=20');
      if (!data.items.length) { empty(body, 'No payout history found.'); return; }
      body.textContent = '';
      data.items.forEach(function (item) {
        var row = document.createElement('tr');
        [item.id, item.amount + ' ' + item.currency, badge(item.status), date(item.createdAt), date(item.completedAt)].forEach(function (value) { row.appendChild(cell(value)); });
        body.appendChild(row);
      });
    } catch (caught) { empty(body, 'Unable to load payout history.'); }
  }
  window.SwaadxDeliveryPartners = { startList: startList, startPartnerDetail: startPartnerDetail, standardColumns: standardColumns };
})();
