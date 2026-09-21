(function () {
  'use strict';
  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function cell(value) { var node = document.createElement('td'); node.textContent = text(value); return node; }
  async function start() {
    var body = document.getElementById('audit-body');
    try {
      var query = new URLSearchParams({ page: '1', pageSize: '50' });
      ['action', 'resourceType', 'resourceId', 'from', 'to'].forEach(function (id) { var node = document.getElementById(id); if (node && node.value.trim()) query.set(id, node.value.trim()); });
      var data = await window.SwaadxAdminApi.getAuditLogs(query.toString());
      if (!data.items.length) { body.textContent = ''; var row = document.createElement('tr'); var empty = document.createElement('td'); empty.colSpan = 7; empty.className = 'table-empty'; empty.textContent = 'No audit records found.'; row.appendChild(empty); body.appendChild(row); return; }
      body.textContent = '';
      data.items.forEach(function (item) {
        var row = document.createElement('tr');
        [date(item.createdAt), item.adminClerkUserId, item.action, item.resourceType, item.resourceId, item.reason, item.requestId].forEach(function (value) { row.appendChild(cell(value)); });
        body.appendChild(row);
      });
    } catch (caught) { var node = document.getElementById('page-error'); if (node) node.textContent = caught.message || 'Unable to load audit records.'; }
  }
  window.SwaadxAudit = { start: start };
})();
