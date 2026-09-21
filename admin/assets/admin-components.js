(function () {
  'use strict';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function status(message, type) {
    var node = element('p', 'status-message' + (type ? ' status-message--' + type : ''), message);
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    return node;
  }

  window.SwaadxAdminComponents = {
    element: element,
    status: status
  };
})();
