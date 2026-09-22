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
    var node = document.getElementById('earning-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted';
    label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  function listPage() {
    var body = document.getElementById('earning-table-body'); var refresh = document.getElementById('earning-refresh'); var searchButton = document.getElementById('earning-search-button'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); if (refresh) refresh.disabled = true;
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        [['earning-search', 'search'], ['earning-partner', 'deliveryPartnerId'], ['earning-restaurant', 'restaurantId'], ['earning-status', 'status'], ['earning-from', 'from'], ['earning-to', 'to']].forEach(function (pair) {
          var input = document.getElementById(pair[0]); if (input && input.value.trim()) query.set(pair[1], input.value.trim());
        });
        var data = await window.SwaadxAdminApi.getEarnings(query.toString());
        if (!data.items || !data.items.length) empty(body, 9, 'No earnings found.');
        else {
          body.textContent = '';
          data.items.forEach(function (earning) {
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'earning.html?id=' + encodeURIComponent(earning.id); action.textContent = 'View';
            body.appendChild(row([earning.orderNumber, earning.restaurantName, earning.deliveryPartner && earning.deliveryPartner.name, earning.amount, earning.status, earning.deliveryStatus, date(earning.createdAt), date(earning.deliveredAt), action]));
          });
        }
        pagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load earnings data.'); empty(body, 9, 'Unable to load earnings data.'); }
      finally { if (refresh) refresh.disabled = false; }
    };
    if (searchButton) searchButton.onclick = function () { load(1); };
    if (refresh) refresh.onclick = function () { load(page); };
    var search = document.getElementById('earning-search'); if (search) search.onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    load(1);
  }
  function detailPage() {
    var id = new URLSearchParams(window.location.search).get('id'); var errorNode = document.getElementById('page-error');
    if (!id) { error('A valid earning ID is required.'); return; }
    window.SwaadxAdminApi.getEarning(id).then(function (earning) {
      document.querySelector('[data-earning-field="id"]').textContent = text(earning.id);
      document.querySelector('[data-earning-field="orderNumber"]').textContent = text(earning.orderNumber);
      document.querySelector('[data-earning-field="restaurant"]').textContent = text(earning.restaurantName);
      document.querySelector('[data-earning-field="partner"]').textContent = text(earning.deliveryPartner && earning.deliveryPartner.name);
      document.querySelector('[data-earning-field="amount"]').textContent = text(earning.amount);
      document.querySelector('[data-earning-field="status"]').textContent = text(earning.status);
      document.querySelector('[data-earning-field="deliveryStatus"]').textContent = text(earning.deliveryStatus);
      document.querySelector('[data-earning-field="createdAt"]').textContent = date(earning.createdAt);
      document.querySelector('[data-earning-field="deliveredAt"]').textContent = date(earning.deliveredAt);
    }).catch(function (caught) { if (errorNode) errorNode.textContent = caught.message || 'Unable to load earnings data.'; });
  }
  window.SwaadxEarnings = { startList: listPage, startDetail: detailPage };
})();
