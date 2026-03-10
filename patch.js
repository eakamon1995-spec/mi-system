// patch.js v6 — GAS Cloud Sync
// ✅ แก้ปัญหา localStorage เต็ม
// ✅ Sync ข้าม device ผ่าน Google Apps Script
// ✅ รองรับ multi-user (token-based auth)
(function () {
  'use strict';

  // ─── CONFIG ────────────────────────────────────────────────
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuwCecWhWT5_RaRj7fGRz7NLe4QD2VMiMps-WSPxUezvQZYW4b_m_Hjp-6SW7G6b0hYg/exec';
  const STORE_KEY = 'mi_poStore';
  const TOKEN_KEYS = ['mi_token', 'token', 'authToken', 'gasToken', 'userToken', 'mi_authToken'];
  const SYNC_DEBOUNCE_MS = 1500; // รอ 1.5s หลังแก้ไขค่อย sync

  // ─── HELPERS ───────────────────────────────────────────────
  function getToken() {
    for (const k of TOKEN_KEYS) {
      try { const v = localStorage.getItem(k); if (v) return v; } catch (e) {}
    }
    if (window.currentUser && window.currentUser.token) return window.currentUser.token;
    if (window._token) return window._token;
    if (window.appState && window.appState.token) return window.appState.token;
    return null;
  }

  async function gasCall(action, payload) {
    const token = getToken();
    if (!token && action !== 'ping') {
      throw new Error('ไม่พบ token — กรุณา Login ก่อน');
    }
    const body = JSON.stringify({ action, token, payload });
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  // ─── SYNC INDICATOR UI ─────────────────────────────────────
  let _syncTimer = null;
  function showSync(msg, type) {
    // type: 'loading' | 'success' | 'error' | 'warn'
    const colors = {
      loading: { bg: '#1e3a5f', icon: '⏳' },
      success: { bg: '#1a7a4a', icon: '☁️' },
      error:   { bg: '#c0392b', icon: '❌' },
      warn:    { bg: '#e67e22', icon: '⚠️' }
    };
    const { bg, icon } = colors[type] || colors.loading;

    let el = document.getElementById('_gasSyncBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = '_gasSyncBadge';
      el.style.cssText = [
        'position:fixed', 'bottom:16px', 'right:16px',
        'padding:8px 14px', 'border-radius:10px',
        'font-size:12px', 'font-family:sans-serif',
        'font-weight:600', 'z-index:99999',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
        'transition:opacity 0.5s,transform 0.3s',
        'pointer-events:none', 'color:#fff'
      ].join(';');
      document.body && document.body.appendChild(el);
    }
    el.style.background = bg;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    el.textContent = icon + ' ' + msg;

    clearTimeout(_syncTimer);
    if (type !== 'loading') {
      _syncTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
      }, 3500);
    }
  }

  // ─── LOAD FROM GAS (init) ──────────────────────────────────
  async function loadFromGAS() {
    try {
      showSync('กำลังโหลดข้อมูลจาก Cloud...', 'loading');
      const result = await gasCall('getPOs', {});
      if (result.ok && Array.isArray(result.data)) {
        // เซฟลง localStorage โดยตรง (bypass override ของเรา)
        try {
          _origSetItem.call(localStorage, STORE_KEY, JSON.stringify(result.data));
        } catch (e) {
          // ถ้ายังเต็มอยู่ก็ไม่เป็นไร ใช้ window.poStore แทน
          console.warn('[patch v6] localStorage full — using memory only');
        }
        // อัพเดต window.poStore
        window.poStore = result.data;
        _lastSyncedJSON = JSON.stringify(result.data);
        showSync('โหลดสำเร็จ ' + result.data.length + ' รายการ', 'success');

        // Trigger re-render ถ้า function มีอยู่
        ['renderPOList', 'loadPOs', 'refreshPO', 'renderTable', 'init'].forEach(fn => {
          if (typeof window[fn] === 'function') {
            try { window[fn](); } catch (e) {}
          }
        });
      } else {
        showSync((result.error || 'โหลดไม่สำเร็จ'), 'error');
      }
    } catch (e) {
      showSync('Network error: ' + e.message, 'error');
      console.error('[patch v6] loadFromGAS:', e);
    }
  }

  // ─── SYNC CHANGED POs TO GAS ──────────────────────────────
  let _lastSyncedJSON = null;
  let _debounceTimer = null;

  function scheduleSyncToGAS(jsonValue) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => syncToGAS(jsonValue), SYNC_DEBOUNCE_MS);
  }

  async function syncToGAS(jsonValue) {
    try {
      const newPOs = JSON.parse(jsonValue);
      if (!Array.isArray(newPOs)) return;

      const lastPOs = _lastSyncedJSON ? JSON.parse(_lastSyncedJSON) : [];
      const lastMap = {};
      lastPOs.forEach(p => { lastMap[p.id] = JSON.stringify(p); });

      // หา PO ที่เปลี่ยนแปลง (ใหม่ หรือ แก้ไข)
      const changed = newPOs.filter(p => lastMap[p.id] !== JSON.stringify(p));

      if (changed.length === 0) {
        return; // ไม่มีอะไรเปลี่ยน
      }

      showSync('กำลัง sync ' + changed.length + ' รายการ...', 'loading');

      const results = await Promise.all(changed.map(po => gasCall('savePO', po).catch(e => ({ ok: false, error: e.message }))));
      const failed = results.filter(r => !r.ok);

      if (failed.length === 0) {
        _lastSyncedJSON = jsonValue;
        showSync('Sync สำเร็จ (' + changed.length + ' รายการ)', 'success');
      } else {
        showSync('Sync บางส่วนล้มเหลว ' + failed.length + '/' + changed.length, 'warn');
        console.warn('[patch v6] sync errors:', failed);
      }
    } catch (e) {
      showSync('Sync error: ' + e.message, 'error');
      console.error('[patch v6] syncToGAS:', e);
    }
  }

  // ─── INTERCEPT localStorage ────────────────────────────────
  const _origSetItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem') ?
    Storage.prototype.setItem.bind(localStorage) :
    localStorage.setItem.bind(localStorage);

  const _origGetItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem') ?
    Storage.prototype.getItem.bind(localStorage) :
    localStorage.getItem.bind(localStorage);

  const _origRemoveItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'removeItem') ?
    Storage.prototype.removeItem.bind(localStorage) :
    localStorage.removeItem.bind(localStorage);

  try {
    Object.defineProperty(localStorage, 'setItem', {
      value: function (key, value) {
        if (key === STORE_KEY) {
          // พยายาม save local ก่อน (ถ้าไม่เต็ม)
          try { _origSetItem(key, value); } catch (e) {
            // Quota exceeded — ไม่เป็นไร ใช้ memory
            console.warn('[patch v6] localStorage quota exceeded — cloud sync only');
          }
          // ส่งขึ้น GAS (debounced)
          if (getToken()) {
            scheduleSyncToGAS(value);
          }
          return;
        }
        _origSetItem(key, value);
      },
      writable: true, configurable: true
    });
  } catch (e) {
    // fallback
    localStorage.setItem = function (key, value) {
      if (key === STORE_KEY) {
        try { _origSetItem(key, value); } catch (ex) {}
        if (getToken()) scheduleSyncToGAS(value);
        return;
      }
      _origSetItem(key, value);
    };
  }

  // ─── MANUAL SYNC BUTTON ────────────────────────────────────
  window.gasSync = {
    pull: loadFromGAS,
    push: async () => {
      const json = _origGetItem(STORE_KEY) || JSON.stringify(window.poStore || []);
      if (json) await syncToGAS(json);
    },
    clearLocal: () => {
      try { _origRemoveItem(STORE_KEY); console.log('[patch v6] local cache cleared'); } catch (e) {}
    }
  };

  // ─── v5: Fix saveP0 material ──────────────────────────────
  var _origSave = window.saveP0;
  window.saveP0 = function () {
    var origPush = Array.prototype.push;
    Array.prototype.push = function (obj) {
      if (obj && typeof obj === 'object' && 'seq' in obj && 'engName' in obj && !('material' in obj)) {
        var rows = document.querySelectorAll('#poItemsTable tbody tr');
        for (var i = 0; i < rows.length; i++) {
          var enEl = rows[i].querySelector('.po-engname');
          if (enEl && enEl.value === obj.engName) {
            var matEl = rows[i].querySelector('.po-material');
            obj.material = matEl ? matEl.value : '';
            break;
          }
        }
      }
      return origPush.apply(this, arguments);
    };
    var result = _origSave ? _origSave.apply(this, arguments) : undefined;
    Array.prototype.push = origPush;
    return result;
  };

  // ─── v5: Fix printSinglePO ────────────────────────────────
  function fetchCNYRate(deliveryDate, cb) {
    var date = deliveryDate ? deliveryDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
    var url = 'https://api.frankfurter.app/' + date + '?from=CNY&to=THB';
    fetch(url).then(function (r) { return r.json(); })
      .then(function (d) {
        var rate = d.rates && d.rates.THB ? d.rates.THB.toFixed(4) : 'N/A';
        cb(rate, d.date || date);
      }).catch(function () { cb('N/A', date); });
  }

  function patchPrintFn() {
    if (!window.printSinglePO) { setTimeout(patchPrintFn, 300); return; }
    var _orig = window.printSinglePO;
    window.printSinglePO = function (id) {
      var po = (window.poStore || []).find(function (p) { return p.id === id; });
      var delDate = po && po.deliveryDate ? po.deliveryDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
      fetchCNYRate(delDate, function (rate, rateDate) {
        var src = _orig.toString();
        src = src.split("<td>${it.engName||''}</td>").join("<td>${it.engName||''}</td><td>${it.material||''}</td>");
        src = src.split('colspan="11"').join('colspan="12"');
        src = src.replace(/\$\{po\.deliveryDate\?`<div class="po-date">Delivery[^`]*`:''}/, "''");
        var oldDate = '<div class=\"po-date\">Date : ${dateFormatted}</div>';
        var newDate = oldDate +
          '${po.deliveryDate?`<div class=\"po-date\">Expected Delivery : ${new Date(po.deliveryDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>`:""}' +
          '<div class=\"po-date\">CNY/THB Rate : ' + rate + ' (' + rateDate + ')</div>';
        src = src.split(oldDate).join(newDate);
        src = src.split('</style>').join('th,td{border:1px solid #ccc!important;}</style>');
        try {
          var m = src.match(/^function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
          if (m) new Function(m[1], m[2]).call(window, id);
          else _orig.call(window, id);
        } catch (e) { console.error('[patch] err', e); _orig.call(window, id); }
      });
    };
  }
  patchPrintFn();

  // ─── INIT SYNC ─────────────────────────────────────────────
  function initSync() {
    const token = getToken();
    if (token) {
      // มี token แล้ว โหลดเลย
      loadFromGAS();
    } else {
      // รอ token (user ยังไม่ login)
      let attempts = 0;
      const t = setInterval(() => {
        if (getToken()) {
          clearInterval(t);
          loadFromGAS();
        }
        if (++attempts > 120) clearInterval(t); // หยุดรอหลัง 60s
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSync);
  } else {
    setTimeout(initSync, 600);
  }

  console.log('[patch.js] v6 loaded — GAS Sync ready');
  console.log('[patch.js] Manual controls: gasSync.pull() | gasSync.push() | gasSync.clearLocal()');
})();
