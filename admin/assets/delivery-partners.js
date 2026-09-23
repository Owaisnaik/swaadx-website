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
    if (node) node.textContent = message || '';
  }
  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  function getListOptions(options) {
    var search = document.getElementById('partner-search');
    var status = document.getElementById('partner-status');
    return {
      search: search ? search.value.trim() : '',
      status: options.fixedStatus || (status ? status.value : ''),
      page: options.page || 1,
      pageSize: 20
    };
  }
  function renderPagination(data, load) {
    var node = document.getElementById('partner-pagination');
    if (!node) return;
    node.textContent = '';
    var label = document.createElement('span');
    label.className = 'muted';
    label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results';
    node.appendChild(label);
    if (data.page > 1) {
      var previous = document.createElement('button');
      previous.className = 'button button--quiet';
      previous.textContent = 'Previous';
      previous.addEventListener('click', function () { load(data.page - 1); });
      node.appendChild(previous);
    }
    if (data.page < data.totalPages) {
      var next = document.createElement('button');
      next.className = 'button button--quiet';
      next.textContent = 'Next';
      next.addEventListener('click', function () { load(data.page + 1); });
      node.appendChild(next);
    }
  }
  function buildRow(partner, columns) {
    var row = document.createElement('tr');
    columns.forEach(function (column) {
      row.appendChild(cell(column.render ? column.render(partner) : partner[column.key]));
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
  function renderList(data, columns, load) {
    var body = document.getElementById('partner-table-body');
    if (!body) return;
    body.setAttribute('data-columns', String(columns.length + 1));
    if (!data.items || !data.items.length) empty(body, 'No delivery partners found.');
    else {
      body.textContent = '';
      data.items.forEach(function (partner) { body.appendChild(buildRow(partner, columns)); });
    }
    var total = document.getElementById('partner-total');
    if (total) total.textContent = data.total.toLocaleString() + ' partner' + (data.total === 1 ? '' : 's');
    renderPagination(data, load);
  }
  async function startList(options) {
    options = options || {};
    var page = 1;
    var searchButton = document.getElementById('partner-search-button');
    var refreshButton = document.getElementById('partner-refresh');
    var load = async function (requestedPage) {
      page = requestedPage || 1;
      error('');
      setBusy(refreshButton, true);
      var body = document.getElementById('partner-table-body');
      if (body) body.innerHTML = '<tr><td colspan="' + (options.columns.length + 1) + '">Loading partners…</td></tr>';
      try {
        var filters = getListOptions({ fixedStatus: options.status, page: page });
        var query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
        if (filters.status) query.set('status', filters.status);
        if (filters.search) query.set('search', filters.search);
        var data = await window.SwaadxAdminApi.getDeliveryPartners(query.toString());
        renderList(data, options.columns, load);
      } catch (caught) {
        error(caught.message || 'Unable to load delivery partners.');
        if (body) empty(body, 'Unable to load delivery partners.');
      } finally { setBusy(refreshButton, false); }
    };
    if (searchButton) searchButton.addEventListener('click', function () { load(1); });
    if (refreshButton) refreshButton.addEventListener('click', function () { load(page); });
    var search = document.getElementById('partner-search');
    if (search) search.addEventListener('keydown', function (event) { if (event.key === 'Enter') load(1); });
    await load(1);
  }
  function standardColumns(includeApplication) {
    var columns = [
      { key: 'fullName', render: function (p) { return text(p.fullName) + ' (' + text(p.id).slice(0, 8) + ')'; } },
      { key: 'phone' },
      { key: 'email' },
      { key: 'status', render: function (p) { return badge(p.status); } },
      { key: 'isOnline', render: function (p) { return badge(p.isOnline ? 'Online' : 'Offline'); } },
      { key: 'createdAt', render: function (p) { return date(p.createdAt); } },
      { key: 'applicationSubmittedAt', render: function (p) { return date(p.applicationSubmittedAt); } }
    ];
    if (includeApplication) columns.push({ key: 'onboardingCompletedAt', render: function (p) { return p.onboardingCompletedAt ? date(p.onboardingCompletedAt) : 'Not completed'; } });
    return columns;
  }
  function renderActions(partner) {
    var container = document.getElementById('partner-actions');
    if (!container) return;
    container.textContent = '';
    var canApprove = partner.approvalRequirements && partner.approvalRequirements.missing && !partner.approvalRequirements.missing.length;
    var actions = {
      pending: (canApprove ? [{ label: 'Approve', action: 'approve' }] : []).concat([{ label: 'Reject', action: 'reject' }]),
      approved: [{ label: 'Suspend', action: 'suspend' }],
      suspended: [{ label: 'Reactivate', action: 'reactivate' }]
    }[partner.status] || [];
    actions.forEach(function (item) {
      var button = document.createElement('button');
      button.className = 'button button--quiet';
      button.textContent = item.label;
      button.addEventListener('click', function () { changeStatus(partner, item.action, button); });
      container.appendChild(button);
    });
    if (partner.status === 'pending' && !canApprove) {
      var missing = document.createElement('p');
      missing.className = 'muted';
      missing.textContent = 'Approval unavailable: ' + ((partner.approvalRequirements && partner.approvalRequirements.missing) || ['Application, KYC, and payout review are required.']).join(' ');
      container.appendChild(missing);
    }
    if (!actions.length && partner.status !== 'pending') container.textContent = 'No status actions are available for this partner.';
  }
  async function changeStatus(partner, action, button) {
    var label = action.charAt(0).toUpperCase() + action.slice(1);
    var reason = window.prompt('Optional reason for ' + label.toLowerCase() + ' ' + text(partner.fullName) + ':', '');
    if (reason === null) return;
    if (!window.confirm(label + ' delivery partner ' + text(partner.fullName) + '?')) return;
    setBusy(button, true);
    error('');
    try {
      var result = await window.SwaadxAdminApi.changeDeliveryPartnerStatus(partner.id, action, reason.trim());
      partner.status = result.status;
      var statusNode = document.querySelector('[data-field="Status"]');
      if (statusNode) statusNode.textContent = result.status;
      renderActions(partner);
      var notice = document.getElementById('action-success');
      if (notice) notice.textContent = 'Partner status updated to ' + result.status + '.';
    } catch (caught) { error(caught.message || 'Unable to update partner status.'); setBusy(button, false); }
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
        'Address': partner.address, 'Date of birth': partner.dateOfBirth, 'Vehicle type': partner.vehicleType,
        'Registration': partner.vehicleRegistrationNumber, 'Driving licence': partner.drivingLicenseNumber,
        'Licence expiry': partner.drivingLicenseExpiry, 'RC number': partner.rcNumber,
        'Application status': partner.applicationStatus,
        'KYC status': partner.kyc && partner.kyc.verificationStatus,
        'Payout method status': partner.payoutStatus,
        'Legal name': partner.kyc && partner.kyc.legalName, 'PAN last4': partner.kyc && partner.kyc.panLast4
      };
      Object.keys(fields).forEach(function (key) {
        var node = document.querySelector('[data-field="' + key + '"]');
        if (node) node.textContent = text(fields[key]);
      });
      var active = document.getElementById('active-delivery');
      if (active) active.textContent = partner.activeDelivery ? text(partner.activeDelivery.orderNumber || partner.activeDelivery.orderId) + ' · ' + text(partner.activeDelivery.status) : 'No active delivery';
      var kycLink = document.getElementById('kyc-link');
      if (kycLink && partner.kyc && partner.kyc.id) {
        var kycStatus = partner.kyc.verificationStatus;
        if (kycStatus === 'verified') {
          kycLink.href = '../kyc/review.html?id=' + encodeURIComponent(partner.kyc.id);
          kycLink.textContent = 'View verified KYC';
        } else if (kycStatus === 'submitted' || kycStatus === 'under_review') {
          kycLink.href = '../kyc/review.html?id=' + encodeURIComponent(partner.kyc.id);
          kycLink.textContent = 'Open KYC review';
        } else {
          kycLink.textContent = kycStatus === 'rejected' ? 'KYC rejected' : 'KYC not submitted';
          kycLink.removeAttribute('href');
        }
      } else if (kycLink) {
        kycLink.textContent = 'No KYC profile';
        kycLink.removeAttribute('href');
      }
      renderActions(partner);
      await Promise.all([loadDeliveries(id), loadEarnings(id), loadPayoutMethods(id), loadPayouts(id), loadKycDocuments(partner.kyc && partner.kyc.id)]);
    } catch (caught) { error(caught.message || 'Unable to load the delivery partner.'); }
  }
  async function loadKycDocuments(profileId) {
    var body = document.getElementById('kyc-documents-body');
    if (!body) return;
    if (!profileId) { empty(body, 'No KYC profile found.'); return; }
    try {
      var documents = await window.SwaadxAdminApi.getKycDocuments(profileId);
      if (!documents.length) { empty(body, 'No KYC documents found.'); return; }
      body.textContent = '';
      documents.forEach(function (documentItem) {
        var row = document.createElement('tr');
        [documentItem.documentType, badge(documentItem.verificationStatus), date(documentItem.expiryDate)].forEach(function (value) { row.appendChild(cell(value)); });
        body.appendChild(row);
      });
    } catch (caught) { empty(body, 'Unable to load KYC document statuses.'); }
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
