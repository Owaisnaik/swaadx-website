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
  function detailField(label, value) {
    var node = document.createElement('p');
    var name = document.createElement('strong'); name.textContent = label + ': '; node.appendChild(name);
    node.appendChild(document.createTextNode(text(value)));
    return node;
  }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function methodFor(methods) { return (methods || []).find(function (method) { return method.isDefault; }) || (methods || [])[0] || null; }
  function eligible(partner, methods) {
    var methodList = Array.isArray(methods) ? methods : [methods];
    return Boolean(partner.kyc && partner.kyc.verificationStatus === 'verified' && methodList.some(function (method) { return method && method.status === 'verified'; }));
  }
  async function loadPaymentData(partner, includeSensitive) {
    var detail = await window.SwaadxAdminApi.getDeliveryPartner(partner.id);
    var methods = await window.SwaadxAdminApi.getPayoutMethods(partner.id, Boolean(includeSensitive));
    return { partner: detail, methods: methods, method: methodFor(methods) };
  }
  function payoutValue(method) {
    if (!method) return '—';
    if (method.methodType === 'upi') return text(method.maskedUpi);
    return method.accountLast4 ? '•••• ' + method.accountLast4 : '—';
  }
  function renderRows(rows, statusFilter, body) {
    var visibleRows = rows.filter(function (entry) {
      var isVerified = eligible(entry.partner, entry.methods);
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
      var data = await loadPaymentData({ id: id }, true); var partner = data.partner; var method = data.method; var kyc = partner.kyc || {}; var isEligible = eligible(partner, data.methods);
      var values = { name: partner.fullName, id: partner.id, phone: partner.phone, email: partner.email, kycStatus: kyc.verificationStatus, kycVerifiedAt: date(kyc.verifiedAt), kycEligible: kyc.verificationStatus === 'verified' ? 'Yes' : 'No', methodEligible: method && method.status === 'verified' ? 'Yes' : 'No', eligibility: isEligible ? 'Eligible' : 'Not eligible', accountHolderName: method && method.accountHolderName, bankName: method && method.bankName, ifsc: method && method.ifsc, accountLast4: method && method.accountLast4, accountNumber: method && method.accountNumber, maskedUpi: method && method.maskedUpi, upiId: method && method.upiId, methodType: method && method.methodType, methodStatus: method && method.status, isDefault: method ? (method.isDefault ? 'Yes' : 'No') : null, providerBeneficiaryReference: method && method.providerBeneficiaryReference, verifiedAt: date(method && method.verifiedAt) };
      Object.keys(values).forEach(function (key) { var node = document.querySelector('[data-payment-field="' + key + '"]'); if (node) node.textContent = text(values[key]); });
      var methods = await window.SwaadxAdminApi.getPayoutMethods(id, true);
      var methodsNode = document.getElementById('payment-method-review-list');
      if (methodsNode) {
        methodsNode.textContent = '';
        methods.forEach(function (item) {
          var card = document.createElement('article'); card.className = 'detail-item';
          var title = document.createElement('strong'); title.textContent = item.methodType === 'bank_account' ? 'Bank account' : 'UPI ID'; card.appendChild(title);
          if (item.methodType === 'bank_account') {
            card.appendChild(detailField('Account holder name', item.accountHolderName));
            card.appendChild(detailField('Bank name', item.bankName));
            card.appendChild(detailField('Full account number', item.accountNumber));
            card.appendChild(detailField('IFSC', item.ifsc));
            card.appendChild(detailField('Account last 4 digits', item.accountLast4));
          } else {
            card.appendChild(detailField('Full UPI ID', item.upiId));
          }
          card.appendChild(detailField('Method status', item.status));
          card.appendChild(detailField('Default', item.isDefault ? 'Yes' : 'No'));
          card.appendChild(detailField('Verified date', date(item.verifiedAt)));
          if (item.status === 'pending') {
            var verify = document.createElement('button'); verify.className = 'button'; verify.type = 'button'; verify.textContent = 'Verify'; verify.onclick = function () { window.SwaadxAdminApi.changePayoutMethodStatus(id, item.id, 'verify').then(startDetail).catch(function (caught) { error(caught.message || 'Unable to verify payout method.'); }); };
            var reject = document.createElement('button'); reject.className = 'button button--quiet'; reject.type = 'button'; reject.textContent = 'Reject'; reject.onclick = function () { var reason = window.prompt('Reason for rejecting this payout method:'); if (reason) window.SwaadxAdminApi.changePayoutMethodStatus(id, item.id, 'reject', reason).then(startDetail).catch(function (caught) { error(caught.message || 'Unable to reject payout method.'); }); };
            card.appendChild(verify); card.appendChild(reject);
          }
          methodsNode.appendChild(card);
        });
      }
    } catch (caught) { error(caught.message || 'Unable to load payment details.'); }
  }
  window.SwaadxPaymentDetails = { startList: startList, startDetail: startDetail };
})();
