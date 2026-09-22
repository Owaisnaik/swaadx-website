(function () {
  'use strict';
  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function row(values) { var tr = document.createElement('tr'); values.forEach(function (value) { var td = document.createElement('td'); if (value && value.nodeType) td.appendChild(value); else td.textContent = text(value); tr.appendChild(td); }); return tr; }
  function empty(body, columns, message) { body.textContent = ''; var tr = document.createElement('tr'); var td = document.createElement('td'); td.colSpan = columns; td.className = 'table-empty'; td.textContent = message; tr.appendChild(td); body.appendChild(tr); }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function pagination(data, load) { var node = document.getElementById('payout-pagination'); if (!node) return; node.textContent = ''; var label = document.createElement('span'); label.className = 'muted'; label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label); if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); } if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); } }
  function listPage() {
    var body = document.getElementById('payout-table-body'); var refresh = document.getElementById('payout-refresh'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); if (refresh) refresh.disabled = true;
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        [['payout-status', 'status'], ['payout-partner', 'deliveryPartnerId'], ['payout-settlement', 'settlementId'], ['payout-from', 'from'], ['payout-to', 'to']].forEach(function (pair) { var input = document.getElementById(pair[0]); if (input && input.value.trim()) query.set(pair[1], input.value.trim()); });
        var data = await window.SwaadxAdminApi.getPayouts(query.toString());
        if (!data.items || !data.items.length) empty(body, 7, 'No payouts found.');
        else { body.textContent = ''; data.items.forEach(function (payout) { var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'payout.html?id=' + encodeURIComponent(payout.id); action.textContent = 'View'; body.appendChild(row([payout.deliveryPartner && payout.deliveryPartner.name, payout.amount === null ? null : payout.amount + ' ' + (payout.currency || 'INR'), payout.status, payout.settlement && payout.settlement.status, payout.payoutMethod && (payout.payoutMethod.maskedUpi || (payout.payoutMethod.methodType + ' •••• ' + payout.payoutMethod.accountLast4)), date(payout.createdAt), action])); }); }
        pagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load payout data.'); empty(body, 7, 'Unable to load payout data.'); } finally { if (refresh) refresh.disabled = false; }
    };
    var search = document.getElementById('payout-search-button'); if (search) search.onclick = function () { load(1); }; if (refresh) refresh.onclick = function () { load(page); }; load(1);
  }
  function detailPage() {
    var id = new URLSearchParams(window.location.search).get('id'); if (!id) { error('A valid payout ID is required.'); return; }
    window.SwaadxAdminApi.getPayout(id).then(function (payout) {
      ['id', 'amount', 'currency', 'status', 'createdAt', 'processingAt', 'completedAt', 'failedAt', 'providerName', 'providerPayoutId', 'providerTransactionReference', 'failureCode', 'attemptCount'].forEach(function (field) { var node = document.querySelector('[data-payout-field="' + field + '"]'); if (node) node.textContent = field.indexOf('At') >= 0 ? date(payout[field]) : text(payout[field]); });
      var partner = document.querySelector('[data-payout-field="partner"]'); if (partner) partner.textContent = text(payout.deliveryPartner && payout.deliveryPartner.name);
      var settlement = payout.settlement || {}; ['id', 'periodStart', 'periodEnd', 'grossAmount', 'adjustmentsAmount', 'payableAmount', 'status', 'processedAt'].forEach(function (field) { var node = document.querySelector('[data-settlement-field="' + field + '"]'); if (node) node.textContent = field === 'processedAt' ? date(settlement[field]) : text(settlement[field]); });
      var method = payout.payoutMethod || {}; ['methodType', 'status', 'accountHolderName', 'bankName', 'accountLast4', 'maskedUpi'].forEach(function (field) { var node = document.querySelector('[data-method-field="' + field + '"]'); if (node) node.textContent = text(method[field]); });
      var items = document.getElementById('payout-items'); if (items) { items.textContent = ''; (payout.items || []).forEach(function (item) { var earning = item.earning || {}; var order = earning.order || {}; items.appendChild(row([order.orderNumber, order.restaurantName, item.amount, earning.status, date(item.createdAt)])); }); if (!payout.items || !payout.items.length) empty(items, 5, 'No payout items.'); }
    }).catch(function (caught) { error(caught.message || 'Unable to load payout data.'); });
  }
  window.SwaadxPayouts = { startList: listPage, startDetail: detailPage };
})();
