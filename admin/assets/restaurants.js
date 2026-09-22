(function () {
  'use strict';

  function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function date(value) { return value ? new Date(value).toLocaleString() : '—'; }
  function cell(value) { var node = document.createElement('td'); node.textContent = text(value); return node; }
  function badge(value) { var node = document.createElement('span'); node.className = 'status-pill status-pill--neutral'; node.textContent = text(value); return node; }
  function error(message) { var node = document.getElementById('page-error'); if (node) node.textContent = message || ''; }
  function empty(body, columns, message) {
    body.textContent = '';
    var row = document.createElement('tr'); var item = document.createElement('td');
    item.colSpan = columns; item.className = 'table-empty'; item.textContent = message;
    row.appendChild(item); body.appendChild(row);
  }
  function setBusy(button, busy) { if (button) { button.disabled = busy; button.setAttribute('aria-busy', busy ? 'true' : 'false'); } }
  function renderPagination(data, load) {
    var node = document.getElementById('restaurant-pagination'); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted';
    label.textContent = data.total ? 'Page ' + data.page + ' of ' + data.totalPages : 'No results'; node.appendChild(label);
    if (data.page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(data.page - 1); }; node.appendChild(previous); }
    if (data.page < data.totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(data.page + 1); }; node.appendChild(next); }
  }
  function tableRow(values) {
    var row = document.createElement('tr');
    values.forEach(function (value) { row.appendChild(value && value.nodeType ? (function () { var node = document.createElement('td'); node.appendChild(value); return node; }()) : cell(value)); });
    return row;
  }
  function renderRestaurantActions(restaurant, reload) {
    var container = document.getElementById('restaurant-actions'); var help = document.getElementById('restaurant-action-help');
    if (!container) return;
    container.textContent = '';
    var action = restaurant.lifecycleStatus === 'archived' ? 'reactivate' : 'archive';
    if (help) help.textContent = action === 'archive' ? 'Archive hides this restaurant from customer discovery without deleting historical data.' : 'Reactivate changes lifecycle state only; operational availability remains unchanged.';
    if (action === 'reactivate') {
      var reactivate = document.createElement('button'); reactivate.type = 'button'; reactivate.className = 'button button--quiet'; reactivate.textContent = 'Reactivate Restaurant';
      reactivate.onclick = async function () { setBusy(reactivate, true); try { await window.SwaadxAdminApi.changeRestaurantLifecycle(restaurant.id, action); await reload(restaurant.menuPage); } catch (caught) { error(caught.message || 'Unable to reactivate restaurant.'); setBusy(reactivate, false); } };
      container.appendChild(reactivate);
      return;
    }
    var prompt = document.createElement('p'); prompt.className = 'muted'; prompt.textContent = 'Type "' + restaurant.name + '" to enable archiving. Historical orders, payments, deliveries, reviews, and earnings are preserved.';
    var nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.placeholder = 'Restaurant name'; nameInput.setAttribute('aria-label', 'Type restaurant name to confirm archive');
    var reasonInput = document.createElement('input'); reasonInput.type = 'text'; reasonInput.maxLength = 500; reasonInput.placeholder = 'Optional archive reason'; reasonInput.setAttribute('aria-label', 'Archive reason');
    var archive = document.createElement('button'); archive.type = 'button'; archive.className = 'button button--quiet'; archive.textContent = 'Archive Restaurant'; archive.disabled = true;
    nameInput.oninput = function () { archive.disabled = nameInput.value !== restaurant.name; };
    archive.onclick = async function () { setBusy(archive, true); try { await window.SwaadxAdminApi.changeRestaurantLifecycle(restaurant.id, action, reasonInput.value.trim()); await reload(restaurant.menuPage); } catch (caught) { error(caught.message || 'Unable to archive restaurant.'); setBusy(archive, false); } };
    container.appendChild(prompt); container.appendChild(nameInput); container.appendChild(reasonInput); container.appendChild(archive);
  }
  function listPage(mode) {
    var body = document.getElementById('restaurant-table-body'); var refresh = document.getElementById('restaurant-refresh');
    var searchButton = document.getElementById('restaurant-search-button'); var page = 1;
    var load = async function (requestedPage) {
      page = requestedPage || 1; error(''); setBusy(refresh, true);
      try {
        var query = new URLSearchParams({ page: String(page), pageSize: '20' });
        var search = document.getElementById('restaurant-search'); var availability = document.getElementById('restaurant-availability'); var lifecycle = document.getElementById('restaurant-lifecycle');
        if (search && search.value.trim()) query.set('search', search.value.trim());
        if (availability && availability.value) query.set('availability', availability.value);
        if (lifecycle && lifecycle.value && mode === 'all') query.set('lifecycle', lifecycle.value);
        var data = mode === 'menus' ? await window.SwaadxAdminApi.getRestaurantMenus(query.toString()) : mode === 'moderation' ? await window.SwaadxAdminApi.getRestaurantModeration(query.toString()) : await window.SwaadxAdminApi.getRestaurants(query.toString());
        if (!data.items.length) { empty(body, mode === 'moderation' ? 8 : mode === 'menus' ? 6 : 9, 'No restaurants found.'); }
        else {
          body.textContent = '';
          data.items.forEach(function (restaurant) {
            var action = document.createElement('a'); action.className = 'button button--quiet table-action'; action.href = 'restaurant.html?id=' + encodeURIComponent(restaurant.id); action.textContent = 'View';
            var values = mode === 'menus'
              ? [restaurant.name, badge(restaurant.isAvailable ? 'Available' : 'Unavailable'), restaurant.menuItemCount, restaurant.availableItemCount, date(restaurant.createdAt), action]
              : mode === 'moderation'
                ? [restaurant.name, restaurant.description, restaurant.coverImage ? 'Present' : 'None', restaurant.menuItemCount, restaurant.reviewCount, badge(restaurant.isAvailable ? 'Available' : 'Unavailable'), date(restaurant.createdAt), action]
                : [restaurant.name, restaurant.phone, [restaurant.address, restaurant.city, restaurant.state].filter(Boolean).join(', '), restaurant.cuisine, badge(restaurant.lifecycleStatus === 'archived' ? 'Archived' : 'Active'), badge(restaurant.isAvailable ? 'Available' : 'Unavailable'), date(restaurant.createdAt), restaurant.preparationTimeMinutes ? restaurant.preparationTimeMinutes + ' min' : '—', action];
            body.appendChild(tableRow(values));
          });
        }
        renderPagination(data, load);
      } catch (caught) { error(caught.message || 'Unable to load restaurant data.'); empty(body, mode === 'moderation' ? 8 : mode === 'menus' ? 6 : 9, 'Unable to load restaurant data.'); }
      finally { setBusy(refresh, false); }
    };
    if (searchButton) searchButton.onclick = function () { load(1); };
    if (refresh) refresh.onclick = function () { load(page); };
    var search = document.getElementById('restaurant-search'); if (search) search.onkeydown = function (event) { if (event.key === 'Enter') load(1); };
    load(1);
  }
  async function unsupportedPage(kind) {
    var target = document.getElementById('restaurant-capability');
    try {
      var data = kind === 'applications' ? await window.SwaadxAdminApi.getRestaurantApplications() : await window.SwaadxAdminApi.getSuspendedRestaurants();
      if (target) target.textContent = data.reason || 'This capability is not represented in the current schema.';
    } catch (caught) { error(caught.message || 'Unable to load restaurant capability information.'); }
  }
  function renderDetailPagination(id, page, totalPages, load) {
    var node = document.getElementById(id); if (!node) return;
    node.textContent = '';
    var label = document.createElement('span'); label.className = 'muted';
    label.textContent = totalPages ? 'Page ' + page + ' of ' + totalPages : 'No menu items'; node.appendChild(label);
    if (page > 1) { var previous = document.createElement('button'); previous.className = 'button button--quiet'; previous.textContent = 'Previous'; previous.onclick = function () { load(page - 1); }; node.appendChild(previous); }
    if (page < totalPages) { var next = document.createElement('button'); next.className = 'button button--quiet'; next.textContent = 'Next'; next.onclick = function () { load(page + 1); }; node.appendChild(next); }
  }
  async function startDetail() {
    var id = new URLSearchParams(window.location.search).get('id'); if (!id) { error('A restaurant ID is required.'); return; }
    var load = async function (menuPage) {
      try {
      var query = new URLSearchParams({ menuPage: String(menuPage || 1), menuPageSize: '50', reviewPage: '1', reviewPageSize: '50' });
      var restaurant = await window.SwaadxAdminApi.getRestaurant(id, query.toString());
      ['name', 'phone', 'address', 'cuisine', 'lifecycleStatus', 'status', 'createdAt', 'description', 'owner', 'location'].forEach(function (key) {
        var node = document.querySelector('[data-restaurant-field="' + key + '"]'); if (!node) return;
        var value = key === 'status' ? (restaurant.isAvailable ? 'Available' : 'Unavailable') : key === 'lifecycleStatus' ? (restaurant.lifecycleStatus === 'archived' ? 'Archived' : 'Active') : key === 'location' ? [restaurant.city, restaurant.state, restaurant.country, restaurant.postalCode].filter(Boolean).join(', ') : key === 'createdAt' ? date(restaurant.createdAt) : restaurant[key];
        node.textContent = text(value);
      });
      var menuSummary = document.getElementById('restaurant-menu-summary');
      if (menuSummary) menuSummary.textContent = text(restaurant.menuItemCount) + ' total menu item' + (restaurant.menuItemCount === 1 ? '' : 's') + '.';
      renderRestaurantActions(restaurant, load);
      var menuBody = document.getElementById('restaurant-menu-body');
      if (!restaurant.menuItems.length) empty(menuBody, 6, 'No menu items found.');
      else {
        menuBody.textContent = '';
        restaurant.menuItems.forEach(function (item) {
          var action = document.createElement('button'); action.type = 'button'; action.className = 'button button--quiet table-action'; action.textContent = item.available ? 'Deactivate' : 'Reactivate';
          action.onclick = async function () {
            if (!window.confirm((item.available ? 'Deactivate' : 'Reactivate') + ' "' + item.name + '"? Historical orders and records are preserved.')) return;
            setBusy(action, true);
            try { await window.SwaadxAdminApi.changeMenuItemAvailability(restaurant.id, item.id, item.available ? 'deactivate' : 'reactivate'); await load(restaurant.menuPage); }
            catch (caught) { error(caught.message || 'Unable to change menu item availability.'); setBusy(action, false); }
          };
          menuBody.appendChild(tableRow([item.name, item.category, item.price, badge(item.available ? 'Available' : 'Unavailable'), item.description, action]));
        });
      }
      renderDetailPagination('restaurant-menu-pagination', restaurant.menuPage, restaurant.menuTotalPages, load);
      var reviewSummary = document.getElementById('restaurant-review-summary');
      if (reviewSummary) reviewSummary.textContent = text(restaurant.reviewCount) + ' total review' + (restaurant.reviewCount === 1 ? '' : 's') + '.';
      var reviewBody = document.getElementById('restaurant-review-body');
      if (!restaurant.reviews.length) empty(reviewBody, 4, 'No restaurant reviews found.');
      else { reviewBody.textContent = ''; restaurant.reviews.forEach(function (review) { reviewBody.appendChild(tableRow([review.rating + ' / 5', review.reviewText, date(review.createdAt), review.orderId])); }); }
      var loadReviews = function (page) {
        var reviewQuery = new URLSearchParams({ menuPage: String(restaurant.menuPage), menuPageSize: String(restaurant.menuPageSize), reviewPage: String(page), reviewPageSize: '50' });
        window.SwaadxAdminApi.getRestaurant(id, reviewQuery.toString()).then(function (updated) {
          var updatedBody = document.getElementById('restaurant-review-body');
          if (!updated.reviews.length) empty(updatedBody, 4, 'No restaurant reviews found.');
          else { updatedBody.textContent = ''; updated.reviews.forEach(function (review) { updatedBody.appendChild(tableRow([review.rating + ' / 5', review.reviewText, date(review.createdAt), review.orderId])); }); }
          var updatedSummary = document.getElementById('restaurant-review-summary');
          if (updatedSummary) updatedSummary.textContent = text(updated.reviewCount) + ' total review' + (updated.reviewCount === 1 ? '' : 's') + '.';
          renderDetailPagination('restaurant-review-pagination', updated.reviewPage, updated.reviewTotalPages, loadReviews);
        }).catch(function (caught) { error(caught.message || 'Unable to load restaurant reviews.'); });
      };
      renderDetailPagination('restaurant-review-pagination', restaurant.reviewPage, restaurant.reviewTotalPages, loadReviews);
      } catch (caught) { error(caught.message || 'Unable to load restaurant details.'); }
    };
    await load(1);
  }
  window.SwaadxRestaurants = { startList: listPage, startUnsupported: unsupportedPage, startDetail: startDetail };
})();
