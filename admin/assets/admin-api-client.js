(function () {
  'use strict';

  var API_URL = 'https://vgdnnaokucbrfdhxymne.supabase.co/functions/v1/admin-api';

  function AdminApiError(message, status, code) {
    this.name = 'AdminApiError';
    this.message = message;
    this.status = status || 0;
    this.code = code || 'request_failed';
  }

  AdminApiError.prototype = Object.create(Error.prototype);
  AdminApiError.prototype.constructor = AdminApiError;

  async function request(path, options) {
    var clerk = window.Clerk;
    if (!clerk || !clerk.session) throw new AdminApiError('Your admin session has expired. Please sign in again.', 401, 'unauthenticated');
    var token;
    try {
      token = await clerk.session.getToken();
    } catch (error) {
      throw new AdminApiError('Unable to refresh your admin session. Please sign in again.', 401, 'unauthenticated');
    }
    if (!token) throw new AdminApiError('Your admin session has expired. Please sign in again.', 401, 'unauthenticated');
    var requestOptions = options || {};
    var headers = Object.assign({}, requestOptions.headers || {}, { Authorization: 'Bearer ' + token });
    var response;
    try {
      response = await fetch(API_URL + path, Object.assign({}, requestOptions, { headers: headers }));
    } catch (error) {
      throw new AdminApiError('The admin service could not be reached. Please try again.', 0, 'network_error');
    }
    var payload = await response.json().catch(function () { return {}; });
    if (response.status === 401) throw new AdminApiError('Your admin session has expired. Please sign in again.', 401, 'unauthenticated');
    if (response.status === 403) throw new AdminApiError('This Clerk account is not authorized for SWAADx administration.', 403, 'forbidden');
    if (!response.ok) {
      var message = payload.error && payload.error.message ? payload.error.message : 'The admin request could not be completed.';
      throw new AdminApiError(message, response.status, 'request_failed');
    }
    return payload.data || {};
  }

  window.SwaadxAdminApi = {
    request: request,
    getMe: function () { return request('/me'); },
    getNavigation: function () { return request('/navigation'); },
    getDashboardSummary: function () { return request('/dashboard-summary'); },
    getDeliveryPartners: function (query) { return request('/delivery-partners' + (query ? '?' + query : '')); },
    getDeliveryPartner: function (id) { return request('/delivery-partners/' + encodeURIComponent(id)); },
    getPartnerDeliveries: function (id, query) { return request('/delivery-partners/' + encodeURIComponent(id) + '/deliveries' + (query ? '?' + query : '')); },
    getPartnerEarnings: function (id, query) { return request('/delivery-partners/' + encodeURIComponent(id) + '/earnings' + (query ? '?' + query : '')); },
    getPayoutMethods: function (id) { return request('/delivery-partners/' + encodeURIComponent(id) + '/payout-methods'); },
    getPartnerPayouts: function (id, query) { return request('/delivery-partners/' + encodeURIComponent(id) + '/payouts' + (query ? '?' + query : '')); },
    changeDeliveryPartnerStatus: function (id, action, reason) {
      return request('/delivery-partners/' + encodeURIComponent(id) + '/' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason: reason } : {})
      });
    },
    getKycProfiles: function (query) { return request('/kyc' + (query ? '?' + query : '')); },
    getKycProfile: function (id) { return request('/kyc/' + encodeURIComponent(id)); },
    getKycDocuments: function (id) { return request('/kyc/' + encodeURIComponent(id) + '/documents'); },
    changeKycStatus: function (id, action, reason) {
      return request('/kyc/' + encodeURIComponent(id) + '/' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason: reason } : {})
      });
    },
    viewKycDocument: function (id) { return request('/kyc/documents/' + encodeURIComponent(id) + '/view'); },
    getRestaurants: function (query) { return request('/restaurants' + (query ? '?' + query : '')); },
    getRestaurant: function (id, query) { return request('/restaurants/' + encodeURIComponent(id) + (query ? '?' + query : '')); },
    getRestaurantMenus: function (query) { return request('/restaurants/menus' + (query ? '?' + query : '')); },
    getRestaurantModeration: function (query) { return request('/restaurants/moderation' + (query ? '?' + query : '')); },
    getRestaurantApplications: function () { return request('/restaurants/applications'); },
    getSuspendedRestaurants: function () { return request('/restaurants/suspended'); },
    getOrders: function (query) { return request('/orders' + (query ? '?' + query : '')); },
    getOrder: function (id) { return request('/orders/' + encodeURIComponent(id)); },
    getPayments: function (query) { return request('/payments' + (query ? '?' + query : '')); },
    getPayment: function (id) { return request('/payments/' + encodeURIComponent(id)); },
    changeRestaurantLifecycle: function (id, action, reason) {
      return request('/restaurants/' + encodeURIComponent(id) + '/' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason: reason } : {})
      });
    },
    changeMenuItemAvailability: function (restaurantId, menuItemId, action) {
      return request('/restaurants/' + encodeURIComponent(restaurantId) + '/menu-items/' + encodeURIComponent(menuItemId) + '/' + encodeURIComponent(action), {
        method: 'POST'
      });
    },
    getAuditLogs: function (query) { return request('/audit' + (query ? '?' + query : '')); },
    AdminApiError: AdminApiError
  };
})();
