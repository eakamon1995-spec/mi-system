// ── RUNTIME PATCH (runs automatically when page loads) ──────────────────────
// FIX 4: Auto-set default GAS URL + block skipLogin + MutationObserver
(function() {
  var D = 'https://script.google.com/macros/s/AKfycbw4PeI5IhPOWTZSxUKRyZESKg3Dp9s_UzZPJF3fHVyv5vnewY8dNvyaIJY4VQwUqpQRXw/exec';
  if (!localStorage.getItem('mi_erpUrl')) {
    localStorage.setItem('mi_erpUrl', D);
    console.log('[patch] Auto-set mi_erpUrl for new device');
  }
  var _origSkip = window.skipLogin;
  window.skipLogin = function() {
    if (localStorage.getItem('mi_erpUrl')) {
      console.log('[patch] skipLogin blocked');
      var savedToken = localStorage.getItem('mi_erpToken');
      var savedUser  = localStorage.getItem('mi_erpUser');
      if (savedToken && savedUser && window.erpCurrentUser && window.erpCurrentUser.id === 'LOCAL') {
        try {
          window.erpCurrentUser = JSON.parse(savedUser);
          console.log('[patch] session restored — user: ' + window.erpCurrentUser.id);
          return;
        } catch(e) { console.log('[patch] restore parse error', e); }
      }
      if (window.erpCurrentUser && window.erpCurrentUser.id === 'LOCAL') {
        window.erpCurrentUser = null;
      }
      if (typeof window.showLoginErr === 'function') {
        window.showLoginErr('\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u2014 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07');
      }
      return;
    }
    if (typeof _origSkip === 'function') _origSkip();
  };
  console.log('[patch] skipLogin override installed');

  function hideOfflineUI() {
    document.querySelectorAll('*').forEach(function(el) {
      if (!el.children.length && el.textContent &&
          (el.textContent.includes('\u0E15\u0E49\u0E2D\u0E07\u0E15\u0E31\u0E49\u0E07 API URL') ||
           el.textContent.includes('\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 API URL'))) {
        el.style.display = 'none';
      }
    });
    document.querySelectorAll('button, a').forEach(function(el) {
      if (el.textContent.includes('Offline') || el.textContent.includes('\u0E2D\u0E2D\u0E1F\u0E44\u0E25\u0E19\u0E4C')) {
        el.style.display = 'none';
      }
    });
  }
  function startObserver() {
    hideOfflineUI();
    var obs = new MutationObserver(function(muts) {
      if (muts.some(function(m) { return m.addedNodes.length > 0; })) hideOfflineUI();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('[patch] MutationObserver started');
  }
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);
})();

// FIX 5: Internet disconnect/reconnect protection
(function() {
  var banner = document.createElement('div');
  banner.id = 'net-offline-banner';
  banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-family:"Sarabun",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);';
  banner.textContent = '\uD83D\uDD34 \u0E44\u0E21\u0E48\u0E21\u0E35\u0E2D\u0E34\u0E19\u0E40\u0E17\u0E2D\u0E23\u0E4C\u0E40\u0E19\u0E47\u0E15 \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2B\u0E22\u0E38\u0E14 sync \u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27';
  document.body.appendChild(banner);
  window.addEventListener('offline', function() { banner.style.display = 'block'; });
  window.addEventListener('online', function() {
    banner.style.display = 'none';
    setTimeout(function() {
      if (typeof window.pollSync === 'function') window.pollSync();
      else if (typeof window.manualSync === 'function') window.manualSync();
    }, 1500);
  });
  if (!navigator.onLine) banner.style.display = 'block';
})();

// FIX 6: Auto-sync PO/Stock every 5 seconds after login
(function() {
  var SYNC_SEC = 5;
  var _applied = false;
  function tryApply() {
    if (_applied) return;
    if (window.erpCurrentUser && window.erpCurrentUser.id &&
        window.erpCurrentUser.id !== 'LOCAL' &&
        typeof window.startPolling === 'function') {
      window.startPolling(SYNC_SEC);
      _applied = true;
      console.log('[patch] Auto-sync set to ' + SYNC_SEC + 's');
    }
  }
  var _t = setInterval(function() { tryApply(); if (_applied) clearInterval(_t); }, 500);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && _applied && typeof window.startPolling === 'function') {
      window.startPolling(SYNC_SEC);
      console.log('[patch] Tab visible — re-sync triggered');
    }
  });
})();
