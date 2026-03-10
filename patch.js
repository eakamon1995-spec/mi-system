// patch.js v7 — GAS Cloud Sync (Fix persist override)
// ✅ แก้ปัญหา localStorage เต็ม (QuotaExceededError)
// ✅ Override persist() โดยตรงใน index.html
// ✅ Sync ข้าม device ผ่าน Google Apps Script
(function () {
  'use strict';

  // ─── CONFIG ────────────────────────────────────────────────
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuwCecWhWT5_RaRj7fGRz7NLe4QD2VMiMps-WSPxUezvQZYW4b_m_Hjp-6SW7G6b0hYg/exec';
  const STORE_KEY = 'mi_poStore';
  const TOKEN_KEYS = ['mi_token', 'token', 'authToken', 'gasToken', 'userToken', 'mi_authToken'];

  // ─── GET TOKEN ─────────────────────────────────────────────
  function getToken() {
    for (const k of TOKEN_KEYS) {
      try { const v = localStorage.getItem(k); if (v) return v; } catch (e) {}
    }
    if (window.currentUser && window.currentUser.token) return window.currentUser.token;
    if (window._token) return window._token;
    if (window.appState && window.appState.token) return window.appState.token;
    return null;
  }

  // ─── GAS API CALL ──────────────────────────────────────────
  async function gasCall(action, payload) {
    const token = getToken();
    const body = JSON.stringify({ action, token, payload });
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  // ─── SYNC BADGE UI ─────────────────────────────────────────
  let _badgeTimer = null;
  function showSync(msg, type) {
    const styles = {
      loading: { bg: '#1e3a5f', icon: '⏳' },
      success: { bg: '#1a7a4a', icon: '☁️' },
      error:   { bg: '#c0392b', icon: '❌' },
      warn:    { bg: '#e67e22', icon: '⚠️' }
    };
    const { bg, icon } = styles[type] || styles.loading;
    let el = document.getElementById('_gasSyncBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = '_gasSyncBadge';
      el.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:8px 14px;border-radius:10px;font-size:12px;font-family:sans-serif;font-weight:600;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:opacity 0.5s,transform 0.3s;pointer-events:none;color:#fff';
      document.body && document.body.appendChild(el);
    }
    el.style.background = bg;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    el.textContent = icon + ' ' + msg;
    clearTimeout(_badgeTimer);
    if (type !== 'loading') {
      _badgeTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
      }, 3500);
    }
  }

  // ─── SAFE localStorage SET (กันล้น) ───────────────────────
  function safeLocalSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, value);
      } catch (e2) {
        console.warn('[patch v7] localStorage full — cloud-only mode');
      }
    }
  }

  // ─── SYNC PO ขึ้น GAS ─────────────────────────────────────
  let _lastSyncedMap = {};

  async function syncSinglePO(po) {
    try {
      showSync('กำลัง Save PO ' + po.id + '...', 'loading');
      const result = await gasCall('savePO', po);
      if (result.ok) {
        _lastSyncedMap[po.id] = JSON.stringify(po);
        showSync('Save สำเร็จ: ' + po.id, 'success');
      } else {
        showSync('Save ล้มเหลว: ' + (result.error || 'unknown'), 'error');
        console.error('[patch v7] savePO error:', result.error);
      }
    } catch (e) {
      showSync('Network error: ' + e.message, 'error');
      console.error('[patch v7] syncSinglePO:', e);
    }
  }

  function syncChangedPOs() {
    const pos = window.poStore;
    if (!Array.isArray(pos)) return;
    const changed = pos.filter(po => _lastSyncedMap[po.id] !== JSON.stringify(po));
    changed.forEach(po => syncSinglePO(po));
  }

  // ─── PATCH persist() — ดักตรงที่ error ────────────────────
  function patchPersist() {
    if (typeof window.persist !== 'function') {
      setTimeout(patchPersist, 100);
      return;
    }
    const _origPersist = window.persist;
    window.persist = function () {
      // ลอง save local ก่อน ถ้าเต็มก็ clear แล้ว retry
      try {
        _origPersist.apply(this, arguments);
      } catch (e) {
        if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
          console.warn('[patch v7] QuotaExceeded in persist() — clearing old data');
          try {
            localStorage.removeItem(STORE_KEY);
            _origPersist.apply(this, arguments);
          } catch (e2) {
            // ยังเต็มอยู่ — cloud-only mode ไม่ throw
            console.warn('[patch v7] Still full — using cloud-only');
          }
        } else {
          throw e; // error อื่นให้ throw ตามปกติ
        }
      }
      // ไม่ว่ากรณีไหน — sync ขึ้น GAS เสมอ
      syncChangedPOs();
    };
    console.log('[patch v7] persist() patched ✅');
  }

  // ─── PATCH savePO() — ดักอีกชั้น ──────────────────────────
  function patchSavePO() {
    if (typeof window.savePO !== 'function') {
      setTimeout(patchSavePO, 100);
      return;
    }
    const _origSavePO = window.savePO;
    window.savePO = function () {
      try {
        _origSavePO.apply(this, arguments);
      } catch (e) {
        if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
          console.warn('[patch v7] QuotaExceeded in savePO() — syncing to cloud');
          syncChangedPOs();
          showSync('บันทึกขึ้น Cloud แทน localStorage', 'warn');
        } else {
          throw e;
        }
      }
    };
    console.log('[patch v7] savePO() patched ✅');
  }

  // ─── LOAD FROM GAS (init) ──────────────────────────────────
  async function loadFromGAS() {
    try {
      showSync('กำลังโหลดข้อมูลจาก Cloud...', 'loading');
      const result = await gasCall('getPOs', {});
      if (result.ok && Array.isArray(result.data)) {
        window.poStore = result.data;
        result.data.forEach(po => { _lastSyncedMap[po.id] = JSON.stringify(po); });
        safeLocalSet(STORE_KEY, JSON.stringify(result.data));
        showSync('โหลดสำเร็จ ' + result.data.length + ' รายการ', 'success');
        // trigger re-render
        ['renderPOList', 'loadPOs', 'refreshPO', 'renderTable', 'renderList'].forEach(fn => {
          if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} }
        });
      } else {
        showSync(result.error || 'โหลดไม่สำเร็จ', 'error');
      }
    } catch (e) {
      showSync('Network error: ' + e.message, 'error');
      console.error('[patch v7] loadFromGAS:', e);
    }
  }

  // ─── MANUAL CONTROLS ───────────────────────────────────────
  window.gasSync = {
    pull: loadFromGAS,
    push: async () => {
      const pos = window.poStore || [];
      showSync('กำลัง push ' + pos.length + ' รายการ...', 'loading');
      for (const po of pos) { await syncSinglePO(po); }
    },
    clearLocal: () => {
      localStorage.removeItem(STORE_KEY);
      console.log('[patch v7] local cache cleared');
    }
  };

  // ─── v5: Fix saveP0 material ──────────────────────────────
  function patchSaveP0() {
    if (!window.saveP0) { setTimeout(patchSaveP0, 300); return; }
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
  }
  patchSaveP0();

  // ─── v5: Fix printSinglePO ────────────────────────────────
  function fetchCNYRate(deliveryDate, cb) {
    var date = deliveryDate ? deliveryDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
    fetch('https://api.frankfurter.app/' + date + '?from=CNY&to=THB')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        cb(d.rates && d.rates.THB ? d.rates.THB.toFixed(4) : 'N/A', d.date || date);
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

  // ─── INIT ──────────────────────────────────────────────────
  function init() {
    patchPersist();
    patchSavePO();

    const token = getToken();
    if (token) {
      loadFromGAS();
    } else {
      let attempts = 0;
      const t = setInterval(() => {
        if (getToken()) { clearInterval(t); loadFromGAS(); }
        if (++attempts > 120) clearInterval(t);
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

  console.log('[patch.js] v7 loaded');
  console.log('[patch.js] Manual: gasSync.pull() | gasSync.push() | gasSync.clearLocal()');
})();
