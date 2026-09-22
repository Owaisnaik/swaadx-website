(function () {
  'use strict';

  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function row(values) {
    var node = document.createElement('tr');
    values.forEach(function (value) {
      var td = document.createElement('td');
      if (value && value.nodeType) td.appendChild(value); else td.textContent = text(value);
      node.appendChild(td);
    });
    return node;
  }
  function empty(body, columns, message) {
    body.textContent = '';
    var tr = document.createElement('tr'); var td = document.createElement('td');
    td.colSpan = columns; td.className = 'table-empty'; td.textContent = message;
    tr.appendChild(td); body.appendChild(tr);
  }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function pagination(data, load) {
    var node = document.getElementById('payment-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted';
    label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  function listPage() {
    var body = document.getElementById('payment-table-body'); var refresh = document.getElementById('payment-refresh'); var searchButton = document.getElementById('payment-search-button'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); if (refresh) refresh.disabled = true;
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        [['payment-search', 'search'], ['payment-status', 'paymentStatus'], ['payment-restaurant', 'restaurantId'], ['payment-from', 'from'], ['payment-to', 'to']].forEach(function (pair) {
          var input = document.getElementById(pair[0]); if (input && input.value.trim()) query.set(pair[1], input.value.trim());
        });
        var data = await window.SwaadxAdminApi.getPayments(query.toString());
        if (!data.items || !data.items.length) empty(body, 10, 'No payment attempts found.');
        else {
          body.textContent = '';
          data.items.forEach(function (payment) {
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'payment.html?id=' + encodeURIComponent(payment.id); action.textContent = 'View';
            body.appendChild(row([payment.orderNumber, payment.customerName, payment.restaurantName, payment.amount === null ? null : payment.amount + ' ' + (payment.currency || 'INR'), payment.paymentStatus, payment.paymentMethod, payment.gatewayStatus, payment.referenceStatus, date(payment.createdAt), action]));
          });
        }
        pagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load payment data.'); empty(body, 10, 'Unable to load payment data.'); }
      finally { if (refresh) refresh.disabled = false; }
    };
    if (searchButton) searchButton.onclick = function () { load(1); };
    if (refresh) refresh.onclick = function () { load(page); };
    var search = document.getElementById('payment-search'); if (search) search.onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    load(1);
  }
  function detailPage() {
    var id = new URLSearchParams(window.location.search).get('id'); var errorNode = document.getElementById('page-error');
    if (!id) { error('A valid payment ID is required.'); return; }
    window.SwaadxAdminApi.getPayment(id).then(function (payment) {
      document.querySelector('[data-payment-field="id"]').textContent = text(payment.id);
      document.querySelector('[data-payment-field="orderNumber"]').textContent = text(payment.orderNumber);
      document.querySelector('[data-payment-field="customerName"]').textContent = text(payment.customerName);
      document.querySelector('[data-payment-field="restaurantName"]').textContent = text(payment.restaurantName);
      document.querySelector('[data-payment-field="amount"]').textContent = payment.amount === null ? '—' : text(payment.amount + ' ' + (payment.currency || 'INR'));
      document.querySelector('[data-payment-field="status"]').textContent = text(payment.paymentStatus);
      document.querySelector('[data-payment-field="method"]').textContent = text(payment.paymentMethod);
      document.querySelector('[data-payment-field="gateway"]').textContent = text(payment.gatewayStatus);
      document.querySelector('[data-payment-field="reference"]').textContent = text(payment.referenceStatus);
      document.querySelector('[data-payment-field="createdAt"]').textContent = date(payment.createdAt);
      document.querySelector('[data-payment-field="updatedAt"]').textContent = date(payment.updatedAt);
      var order = payment.order;
      document.querySelector('[data-payment-field="orderStatus"]').textContent = text(order && order.status);
      document.querySelector('[data-payment-field="orderTotal"]').textContent = order && order.total !== null && order.total !== undefined ? text(order.total + ' ' + (payment.currency || 'INR')) : '—';
    }).catch(function (caught) { if (errorNode) errorNode.textContent = caught.message || 'Unable to load payment data.'; });
  }
  window.SwaadxPayments = { startList: listPage, startDetail: detailPage };
})();
