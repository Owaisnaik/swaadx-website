(function () {
  'use strict';
  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function badge(value, success) {
    var node = document.createElement('span');
    node.className = 'status-pill ' + (success ? 'status-pill--success' : 'status-pill--neutral');
    node.textContent = text(value);
    return node;
  }
  function cell(value) {
    var node = document.createElement('td');
    if (value && value.nodeType) node.appendChild(value); else node.textContent = text(value);
    return node;
  }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function methodFor(methods) { return (methods || []).find(function (method) { return method.isDefault; }) || (methods || [])[0] || null; }
  function eligible(partner, method) { return Boolean(partner.kyc && partner.kyc.verificationStatus === 'verified' && method && method.status === 'verified'); }
  async function loadPaymentData(partner) {
    var detail = await window.SwaadxAdminApi.getDeliveryPartner(partner.id);
    var methods = await window.SwaadxAdminApi.getPayoutMethods(partner.id);
    return { partner: detail, method: methodFor(methods) };
  }
  function payoutValue(method) {
    if (!method) return '—';
    if (method.methodType === 'upi') return text(method.maskedUpi);
    return method.accountLast4 ? '•••• ' + method.accountLast4 : '—';
  }
  function renderRows(rows, statusFilter, body) {
    var visibleRows = rows.filter(function (entry) {
      var isVerified = eligible(entry.partner, entry.method);
      return statusFilter === 'all' || (statusFilter === 'verified' ? isVerified : !isVerified);
    });
    body.textContent = '';
    if (!visibleRows.length) {
      var empty = document.createElement('tr');
      empty.appendChild(cell('No delivery partners found.'));
      empty.firstChild.colSpan = 9;
      body.appendChild(empty);
      return;
    }
    visibleRows.forEach(function (entry) {
      var partner = entry.partner; var method = entry.method; var row = document.createElement('tr'); var action = document.createElement('a');
      action.className = 'button button--quiet table-action'; action.href = 'payment.html?id=' + encodeURIComponent(partner.id); action.textContent = 'View';
      var isEligible = eligible(partner, method);
      [partner.fullName, partner.phone, partner.email, badge(partner.kyc ? partner.kyc.verificationStatus : null, partner.kyc && partner.kyc.verificationStatus === 'verified'), method ? method.methodType : null, payoutValue(method), badge(method ? method.status : null, method && method.status === 'verified'), badge(isEligible ? 'Eligible' : 'Not eligible', isEligible), action].forEach(function (value) { row.appendChild(cell(value)); });
      body.appendChild(row);
    });
  }
  function renderPagination(data, load) {
    var node = document.getElementById('payment-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted'; label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.type = 'button'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.type = 'button'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  async function startList() {
    var body = document.getElementById('payment-table-body'); var page = 1; var refresh = document.getElementById('payment-refresh');
    var statusFilter = document.getElementById('payment-status-filter'); var loadedRows = [];
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); if (refresh) refresh.disabled = true;
      try {
        var search = document.getElementById('payment-search'); var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        if (search && search.value.trim()) query.set('search', search.value.trim());
        var data = await window.SwaadxAdminApi.getDeliveryPartners(query.toString());
        loadedRows = await Promise.all(data.items.map(loadPaymentData));
        renderRows(loadedRows, statusFilter ? statusFilter.value : 'all', body);
        renderPagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load payment details.'); body.textContent = ''; }
      finally { if (refresh) refresh.disabled = false; }
    };
    document.getElementById('payment-search-button').onclick = function () { load(1); };
    refresh.onclick = function () { load(page); };
    document.getElementById('payment-search').onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    if (statusFilter) statusFilter.onchange = function () { renderRows(loadedRows, statusFilter.value, body); };
    await load(1);
  }
  async function startDetail() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { error('A delivery partner ID is required.'); return; }
    try {
      var data = await loadPaymentData({ id: id }); var partner = data.partner; var method = data.method; var kyc = partner.kyc || {}; var isEligible = eligible(partner, method);
      var values = { name: partner.fullName, id: partner.id, phone: partner.phone, email: partner.email, kycStatus: kyc.verificationStatus, kycVerifiedAt: date(kyc.verifiedAt), kycEligible: kyc.verificationStatus === 'verified' ? 'Yes' : 'No', methodEligible: method && method.status === 'verified' ? 'Yes' : 'No', eligibility: isEligible ? 'Eligible' : 'Not eligible', accountHolderName: method && method.accountHolderName, bankName: method && method.bankName, ifsc: method && method.ifsc, accountLast4: method && method.accountLast4, maskedUpi: method && method.maskedUpi, methodType: method && method.methodType, methodStatus: method && method.status, isDefault: method ? (method.isDefault ? 'Yes' : 'No') : null, providerBeneficiaryReference: method && method.providerBeneficiaryReference, verifiedAt: date(method && method.verifiedAt) };
      Object.keys(values).forEach(function (key) { var node = document.querySelector('[data-payment-field="' + key + '"]'); if (node) node.textContent = text(values[key]); });
    } catch (caught) { error(caught.message || 'Unable to load payment details.'); }
  }
  window.SwaadxPaymentDetails = { startList: startList, startDetail: startDetail };
})();
