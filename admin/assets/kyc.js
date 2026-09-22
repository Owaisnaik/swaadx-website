(function () {
  'use strict';
  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function badge(value) { var node = document.createElement('span'); node.className = 'status-pill status-pill--neutral'; node.textContent = text(value); return node; }
  function cell(value) { var node = document.createElement('td'); if (value && value.nodeType) node.appendChild(value); else node.textContent = text(value); return node; }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function empty(body, columns, message) { body.textContent = ''; var row = document.createElement('tr'); var cellNode = document.createElement('td'); cellNode.colSpan = columns; cellNode.className = 'table-empty'; cellNode.textContent = message; row.appendChild(cellNode); body.appendChild(row); }
  function setBusy(button, busy) { if (button) { button.disabled = busy; button.setAttribute('aria-busy', busy ? 'true' : 'false'); } }
  function renderPagination(data, load) {
    var node = document.getElementById('kyc-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted'; label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  async function startList() {
    var body = document.getElementById('kyc-table-body'); var refresh = document.getElementById('kyc-refresh'); var searchButton = document.getElementById('kyc-search-button'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); setBusy(refresh, true);
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        var status = document.getElementById('kyc-status-filter'); var search = document.getElementById('kyc-search');
        if (status && status.value) query.set('status', status.value);
        if (search && search.value.trim()) query.set('search', search.value.trim());
        var data = await window.SwaadxAdminApi.getKycProfiles(query.toString());
        if (!data.items.length)         empty(body, 9, 'No KYC profiles found.');
        else {
          body.textContent = '';
          data.items.forEach(function (profile) {
            var summary = profile.documentSummary || {};
            var documentCount = text(summary.total) + ' document' + (summary.total === 1 ? '' : 's');
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'review.html?id=' + encodeURIComponent(profile.id); action.textContent = 'Review';
            var row = document.createElement('tr');
            [profile.partner && profile.partner.fullName, profile.partner && profile.partner.phone, profile.partner && profile.partner.email, profile.legalName, profile.panLast4 ? '•••• ' + profile.panLast4 : null, badge(profile.verificationStatus), documentCount, date(profile.submittedAt), action].forEach(function (value) { row.appendChild(cell(value)); });
            body.appendChild(row);
          });
        }
        renderPagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load KYC profiles.'); empty(body, 9, 'Unable to load KYC profiles.'); }
      finally { setBusy(refresh, false); }
    };
    if (searchButton) searchButton.onclick = function () { load(1); };
    if (refresh) refresh.onclick = function () { load(page); };
    var search = document.getElementById('kyc-search'); if (search) search.onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    await load(1);
  }
  function field(key, value) { var node = document.querySelector('[data-kyc-field="' + key + '"]'); if (node) node.textContent = text(value); }
  function renderActions(profile, reload) {
    var container = document.getElementById('kyc-actions'); if (!container) return; container.textContent = '';
    var actions = profile.verificationStatus === 'submitted' ? [{ label: 'Start review', action: 'start-review' }] : profile.verificationStatus === 'under_review' ? [{ label: 'Approve', action: 'approve' }, { label: 'Reject', action: 'reject' }] : [];
    if (!actions.length) { container.textContent = 'No KYC decisions are available for this status.'; return; }
    actions.forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'button button--quiet'; button.textContent = item.label;
      button.onclick = async function () {
        var reason = '';
        if (item.action === 'reject') { reason = window.prompt('Enter a rejection reason:', ''); if (reason === null) return; }
        if (!window.confirm(item.label + ' this KYC profile for ' + text(profile.partner && profile.partner.fullName) + '?')) return;
        setBusy(button, true); error('');
        try {
          await window.SwaadxAdminApi.changeKycStatus(profile.id, item.action, reason.trim());
          var success = document.getElementById('kyc-success');
          if (success) success.textContent = item.label + ' completed successfully.';
          await reload();
        }
        catch (caught) { error(caught.message || 'Unable to update KYC status.'); setBusy(button, false); }
      };
      container.appendChild(button);
    });
  }
  async function startReview() {
    var id = new URLSearchParams(window.location.search).get('id'); if (!id) { error('A KYC profile ID is required.'); return; }
    var load = async function () {
      try {
        var profile = await window.SwaadxAdminApi.getKycProfile(id);
        field('partner', profile.partner && profile.partner.fullName); field('partnerId', profile.deliveryPartnerId); field('legalName', profile.legalName);
        field('status', profile.verificationStatus); field('dateOfBirth', profile.dateOfBirth); field('panLast4', profile.panLast4);
        field('submittedAt', date(profile.submittedAt)); field('verifiedAt', date(profile.verifiedAt)); field('rejectedAt', date(profile.rejectedAt)); field('rejectionReason', profile.rejectionReason);
        renderActions(profile, load);
        var body = document.getElementById('documents-body'); var documents = await window.SwaadxAdminApi.getKycDocuments(id);
        if (!documents.length) { empty(body, 6, 'No document metadata found.'); return; }
        body.textContent = '';
        documents.forEach(function (documentRecord) {
          var row = document.createElement('tr');
          [documentRecord.documentType, badge(documentRecord.verificationStatus), date(documentRecord.expiryDate), date(documentRecord.submittedAt), date(documentRecord.verifiedAt)].forEach(function (value) { row.appendChild(cell(value)); });
          var action = document.createElement('button'); action.type = 'button'; action.className = 'button button--quiet table-action'; action.textContent = 'View document'; action.onclick = function () { viewDocument(documentRecord.id, action); }; row.appendChild(cell(action)); body.appendChild(row);
        });
      } catch (caught) { error(caught.message || 'Unable to load KYC review.'); }
    };
    await load();
  }
  async function viewDocument(id, button) {
    setBusy(button, true); button.textContent = 'Loading…';
    try {
      var result = await window.SwaadxAdminApi.viewKycDocument(id); var viewer = document.getElementById('document-viewer'); viewer.textContent = '';
      var link = document.createElement('a'); link.href = result.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open secure document preview'; viewer.appendChild(link);
      var expiry = document.createElement('span'); expiry.className = 'muted'; expiry.textContent = ' (expires in ' + result.expiresInSeconds + ' seconds)'; viewer.appendChild(expiry);
    } catch (caught) { error(caught.message || 'Unable to open document preview.'); }
    button.textContent = 'View document'; setBusy(button, false);
  }
  window.SwaadxKyc = { startList: startList, startReview: startReview };
})();
