(function () {
  'use strict';
  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function badge(value) { var node = document.createElement('span'); node.className = 'status-pill status-pill--neutral'; node.textContent = text(value); return node; }
  function cell(value) { var node = document.createElement('td'); if (value && value.nodeType) node.appendChild(value); else node.textContent = text(value); return node; }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message; }
  function empty(body, columns, message) { body.textContent = ''; var row = document.createElement('tr'); var cellNode = document.createElement('td'); cellNode.colSpan = columns; cellNode.className = 'table-empty'; cellNode.textContent = message; row.appendChild(cellNode); body.appendChild(row); }
  async function startList() {
    var body = document.getElementById('kyc-table-body');
    try {
      var query = new URLSearchParams({ page: '1', pageSize: '50' });
      var status = document.getElementById('kyc-status-filter');
      if (status && status.value) query.set('status', status.value);
      var data = await window.SwaadxAdminApi.getKycProfiles(query.toString());
      if (!data.items.length) { empty(body, 6, 'No KYC profiles found.'); return; }
      body.textContent = '';
      data.items.forEach(function (profile) {
        var row = document.createElement('tr');
        [profile.partner && profile.partner.fullName, profile.legalName, badge(profile.verificationStatus), date(profile.submittedAt), profile.partner && profile.partner.id, null].forEach(function (value, index) {
          if (index === 5) {
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'review.html?id=' + encodeURIComponent(profile.id); action.textContent = 'View'; row.appendChild(cell(action));
          } else row.appendChild(cell(value));
        });
        body.appendChild(row);
      });
    } catch (caught) { error(caught.message || 'Unable to load KYC profiles.'); empty(body, 6, 'Unable to load KYC profiles.'); }
  }
  function field(key, value) { var node = document.querySelector('[data-kyc-field="' + key + '"]'); if (node) node.textContent = text(value); }
  async function startReview() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { error('A KYC profile ID is required.'); return; }
    try {
      var profile = await window.SwaadxAdminApi.getKycProfile(id);
      field('partner', profile.partner && profile.partner.fullName); field('partnerId', profile.deliveryPartnerId);
      field('legalName', profile.legalName); field('status', profile.verificationStatus); field('dateOfBirth', profile.dateOfBirth);
      field('panLast4', profile.panLast4); field('submittedAt', date(profile.submittedAt)); field('verifiedAt', date(profile.verifiedAt));
      field('rejectedAt', date(profile.rejectedAt)); field('rejectionReason', profile.rejectionReason);
      var body = document.getElementById('documents-body');
      var documents = await window.SwaadxAdminApi.getKycDocuments(id);
      if (!documents.length) { empty(body, 6, 'No document metadata found.'); return; }
      body.textContent = '';
      documents.forEach(function (documentRecord) {
        var row = document.createElement('tr');
        [documentRecord.documentType, badge(documentRecord.verificationStatus), date(documentRecord.expiryDate), date(documentRecord.submittedAt), date(documentRecord.verifiedAt)].forEach(function (value) { row.appendChild(cell(value)); });
        var action = document.createElement('button'); action.type = 'button'; action.className = 'button button--quiet table-action'; action.textContent = 'View document'; action.addEventListener('click', function () { viewDocument(documentRecord.id, action); }); row.appendChild(cell(action)); body.appendChild(row);
      });
    } catch (caught) { error(caught.message || 'Unable to load KYC review.'); }
  }
  async function viewDocument(id, button) {
    button.disabled = true; button.textContent = 'Loading…';
    try {
      var result = await window.SwaadxAdminApi.viewKycDocument(id);
      var viewer = document.getElementById('document-viewer'); viewer.textContent = '';
      var link = document.createElement('a'); link.href = result.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open secure document preview'; viewer.appendChild(link);
      var expiry = document.createElement('span'); expiry.className = 'muted'; expiry.textContent = ' (expires in ' + result.expiresInSeconds + ' seconds)'; viewer.appendChild(expiry);
    } catch (caught) { error(caught.message || 'Unable to open document preview.'); }
    button.disabled = false; button.textContent = 'View document';
  }
  window.SwaadxKyc = { startList: startList, startReview: startReview };
})();
