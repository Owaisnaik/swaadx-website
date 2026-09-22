(function () {
  'use strict';

  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function cell(value) { var node = document.createElement('td'); node.textContent = text(value); return node; }
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
    var node = document.getElementById('order-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted';
    label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  function listPage() {
    var body = document.getElementById('order-table-body'); var refresh = document.getElementById('order-refresh'); var searchButton = document.getElementById('order-search-button'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); if (refresh) refresh.disabled = true;
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        [['order-search', 'search'], ['order-status', 'status'], ['order-restaurant', 'restaurantId'], ['order-from', 'from'], ['order-to', 'to'], ['order-payment-status', 'paymentStatus']].forEach(function (pair) {
          var input = document.getElementById(pair[0]); if (input && input.value.trim()) query.set(pair[1], input.value.trim());
        });
        var data = await window.SwaadxAdminApi.getOrders(query.toString());
        if (!data.items || !data.items.length) empty(body, 11, 'No orders found.');
        else {
          body.textContent = '';
          data.items.forEach(function (order) {
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'order.html?id=' + encodeURIComponent(order.id); action.textContent = 'View';
            body.appendChild(row([order.orderNumber, date(order.createdAt), order.status, order.restaurantName, order.customerName, order.subtotal, order.deliveryFee, order.totalAmount, order.paymentStatus, order.deliveryStatus, action]));
          });
        }
        pagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load order data.'); empty(body, 11, 'Unable to load order data.'); }
      finally { if (refresh) refresh.disabled = false; }
    };
    if (searchButton) searchButton.onclick = function () { load(1); };
    if (refresh) refresh.onclick = function () { load(page); };
    var search = document.getElementById('order-search'); if (search) search.onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    load(1);
  }
  function detailPage() {
    var id = new URLSearchParams(window.location.search).get('id'); var errorNode = document.getElementById('page-error');
    if (!id) { error('A valid order ID is required.'); return; }
    window.SwaadxAdminApi.getOrder(id).then(function (order) {
      document.querySelector('[data-order-field="orderNumber"]').textContent = text(order.orderNumber);
      document.querySelector('[data-order-field="status"]').textContent = text(order.status);
      document.querySelector('[data-order-field="createdAt"]').textContent = date(order.createdAt);
      document.querySelector('[data-order-field="restaurant"]').textContent = text(order.restaurant && order.restaurant.name);
      document.querySelector('[data-order-field="customer"]').textContent = text(order.customerName);
      document.querySelector('[data-order-field="paymentStatus"]').textContent = text(order.paymentStatus);
      document.querySelector('[data-order-field="deliveryStatus"]').textContent = text(order.deliveryStatus);
      document.querySelector('[data-order-field="address"]').textContent = text([order.deliveryAddress && order.deliveryAddress.address, order.deliveryAddress && order.deliveryAddress.landmark, order.deliveryAddress && order.deliveryAddress.city, order.deliveryAddress && order.deliveryAddress.state, order.deliveryAddress && order.deliveryAddress.postalCode].filter(Boolean).join(', '));
      document.querySelector('[data-order-field="phone"]').textContent = text(order.deliveryAddress && order.deliveryAddress.phone);
      document.querySelector('[data-order-field="subtotal"]').textContent = text(order.pricing.subtotal);
      document.querySelector('[data-order-field="taxes"]').textContent = text(order.pricing.taxes);
      document.querySelector('[data-order-field="discount"]').textContent = text(order.pricing.discount);
      document.querySelector('[data-order-field="deliveryFee"]').textContent = text(order.pricing.deliveryFee);
      document.querySelector('[data-order-field="total"]').textContent = text(order.pricing.total);
      var partner = order.delivery && order.delivery.partner; document.querySelector('[data-order-field="partner"]').textContent = partner ? text(partner.name) + ' (' + text(partner.status) + ')' : '—';
      var body = document.getElementById('order-items-body'); body.textContent = '';
      if (!order.items.length) empty(body, 5, 'No order items recorded.');
      else order.items.forEach(function (item) { body.appendChild(row([item.name, item.quantity, item.price, Array.isArray(item.selectedAddons) && item.selectedAddons.length ? JSON.stringify(item.selectedAddons) : '—', date(item.createdAt)])); });
    }).catch(function (caught) { if (errorNode) errorNode.textContent = caught.message || 'Unable to load order data.'; });
  }
  window.SwaadxOrders = { startList: listPage, startDetail: detailPage };
})();
