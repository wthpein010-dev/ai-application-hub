(function () {
  var prefix = 'icecream:';
  var storage = {
    WXStorageSetIntSync: function (key, value) { localStorage.setItem(prefix + key, String(value)); },
    WXStorageGetIntSync: function (key, fallback) { var value = localStorage.getItem(prefix + key); return value === null ? fallback : parseInt(value, 10); },
    WXStorageSetFloatSync: function (key, value) { localStorage.setItem(prefix + key, String(value)); },
    WXStorageGetFloatSync: function (key, fallback) { var value = localStorage.getItem(prefix + key); return value === null ? fallback : parseFloat(value); },
    WXStorageSetStringSync: function (key, value) { localStorage.setItem(prefix + key, value); },
    WXStorageGetStringSync: function (key, fallback) { var value = localStorage.getItem(prefix + key); return value === null ? fallback : value; },
    WXStorageDeleteKeySync: function (key) { localStorage.removeItem(prefix + key); },
    WXStorageHasKeySync: function (key) { return localStorage.getItem(prefix + key) !== null; },
    WXStorageDeleteAllSync: function () {
      Object.keys(localStorage).filter(function (key) { return key.indexOf(prefix) === 0; }).forEach(function (key) { localStorage.removeItem(key); });
    }
  };
  window.WXWASMSDK = new Proxy(storage, {
    get: function (target, property) {
      if (property in target) return target[property];
      return function () { return ''; };
    }
  });
})();