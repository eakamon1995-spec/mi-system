// patch.js v10 — GAS Cloud Sync + Drive Image Upload (override bcHandlePic)
// ✅ ดัก QuotaExceededError ที่ Storage.prototype.setItem
// ✅ Override bcHandlePic() โดยตรง — อัปโหลดรูปขึ้น Drive ชื่อไฟล์ = รหัสสินค้า
// ✅ Sync PO ข้าม device ผ่าน Google Apps Script
(function () {
  'use strict';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuwCecWhWT5_RaRj7fGRz7NLe4QD2VMiMps-WSPxUezvQZYW4b_m_Hjp-6SW7G6b0hYg/exec';
  const STORE_KEY = 'mi_poStore';
  const TOKEN_KEYS = ['mi_token', 'token', 'authToken', 'gasToken', 'userToken', 'mi_authToken'];

  // ─── original Storage methods ─────────────────────────────
  const _origSet    = Storage.prototype.setItem;
  const _origGet    = Storage.prototype.getItem;
  const _origRemove = Storage.prototype.removeItem;

  // ─── GET TOKEN ────────────────────────────────────────────
  function getToken() {
    for (const k of TOKEN_KEYS) {
      try { const v = _origGet.call(localStorage, k); if (v) return v; } catch (e) {}
    }
    if (window.currentUser && window.currentUser.token) return window.currentUser.token;
    if (window._token) return window._token;
    return null;
  }

  // ─── GAS API CALL ─────────────────────────────────────────
  async function gasCall(action, payload) {
    const body = JSON.stringify({ action, token: getToken(), payload });
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  // ─── BADGE UI ─────────────────────────────────────────────
  let _badgeTimer = null;
  function showSync(msg, type) {
    const s = {
      loading: { bg: '#1e3a5f', icon: '⏳' },
      success: { bg: '#1a7a4a', icon: '☁️' },
      error:   { bg: '#c0392b', icon: '❌' },
      warn:    { bg: '#e67e22', icon: '⚠️' },
      upload:  { bg: '#6c35a8', icon: '🖼️' }
    };
    const { bg, icon } = s[type] || s.loading;
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
    if (type !== 'loading' && type !== 'upload') {
      _badgeTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
      }, 3500);
    }
  }

  // ─── SYNC PO ขึ้น GAS ────────────────────────────────────
  let _lastSyncedMap = {};
  let _syncQueue = Promise.resolve();

  function queueSync(pos) {
    if (!Array.isArray(pos)) return;
    const changed = pos.filter(po => _lastSyncedMap[po.id] !== JSON.stringify(po));
    if (!changed.length) return;
    _syncQueue = _syncQueue.then(async () => {
      for (const po of changed) {
        try {
          showSync('กำลัง Save PO ' + po.id + '...', 'loading');
          const r = await gasCall('savePO', po);
          if (r.ok) {
            _lastSyncedMap[po.id] = JSON.stringify(po);
            showSync('Save สำเร็จ: ' + po.id, 'success');
          } else {
            showSync('Save ล้มเหลว: ' + (r.error || '?'), 'error');
          }
        } catch (e) {
          showSync('Network error: ' + e.message, 'error');
        }
      }
    });
  }

  // ─── OVERRIDE Storage.prototype.setItem ──────────────────
  Storage.prototype.setItem = function (key, value) {
    if (key === STORE_KEY) {
      try {
        _origSet.call(this, key, value);
      } catch (e) {
        if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
          try {
            _origRemove.call(this, key);
            _origSet.call(this, key, value);
          } catch (e2) {
            console.warn('[patch v10] localStorage full — cloud-only mode');
          }
        } else {
          throw e;
        }
      }
      try {
        const parsed = JSON.parse(value);
        if (getToken()) queueSync(parsed);
      } catch (e) {}
      return;
    }
    _origSet.call(this, key, value);
  };

  // ─── หา CODE สินค้าจาก form ──────────────────────────────
  function getBarcodeCode() {
    // ลอง field ที่น่าจะเป็น code ของ barcode form
    const ids = ['bcCode', 'bc_code', 'productCode', 'itemCode', 'barcodeCode'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.value && el.value.trim()) return el.value.trim();
    }
    // ลอง input ใน modal/form ที่มี placeholder หรือ label ว่า code
    const inputs = document.querySelectorAll('input[type="text"]');
    for (const inp of inputs) {
      if ((inp.placeholder && inp.placeholder.toLowerCase().includes('code')) ||
          (inp.name && inp.name.toLowerCase().includes('code'))) {
        if (inp.value && inp.value.trim()) return inp.value.trim();
      }
    }
    return 'img_' + Date.now();
  }

  // ─── UPLOAD รูปขึ้น GOOGLE DRIVE ─────────────────────────
  async function uploadFileToDrive(file, productCode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = e.target.result;
          const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          const filename = productCode + '.' + ext;

          showSync('กำลังอัปโหลด ' + filename + '...', 'upload');
          console.log('[patch v10] uploading →', filename);

          const result = await gasCall('uploadImage', { base64, filename, mimeType: file.type });

          if (result.ok) {
            showSync('อัปโหลดรูปสำเร็จ: ' + filename, 'success');
            console.log('[patch v10] ✅ Drive URL:', result.url);
            resolve(result.url);
          } else {
            showSync('อัปโหลดล้มเหลว: ' + (result.error || '?'), 'error');
            reject(new Error(result.error));
          }
        } catch (err) {
          showSync('Upload error: ' + err.message, 'error');
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  // ─── OVERRIDE bcHandlePic ─────────────────────────────────
  function patchBcHandlePic() {
    if (typeof window.bcHandlePic !== 'function') {
      setTimeout(patchBcHandlePic, 200);
      return;
    }

    const _origBcHandlePic = window.bcHandlePic;

    window.bcHandlePic = async function (file) {
      if (!file || !file.type.startsWith('image/')) return;

      // ตรวจ size เหมือนเดิม (2MB)
      if (file.size > 2 * 1024 * 1024) {
        if (typeof window.toast === 'function') window.toast('Max 2MB', 'e');
        return;
      }

      // ถ้ายังไม่ได้ login → ใช้ original (base64)
      if (!getToken()) {
        console.warn('[patch v10] ไม่มี token — ใช้ bcHandlePic เดิม');
        return _origBcHandlePic.call(this, file);
      }

      try {
        // หา code สินค้า
        const productCode = getBarcodeCode();
        console.log('[patch v10] bcHandlePic → productCode:', productCode);

        // อัปโหลดขึ้น Drive
        const driveUrl = await uploadFileToDrive(file, productCode);

        // อัปเดต bcCurrentPic เป็น Drive URL แทน base64
        window.bcCurrentPic = driveUrl;

        // อัปเดต preview ใน DOM เหมือนที่ index.html ทำ
        const preview = document.getElementById('bcPicPreview');
        if (preview) {
          preview.innerHTML = `<img src="${driveUrl}" style="max-width:120px;max-height:120px;object-fit:contain;border-radius:6px;">`;
        }

        // dispatch event ให้ index.html รู้
        const zone = document.getElementById('bcPicZone');
        if (zone) {
          zone.dispatchEvent(new CustomEvent('driveUploadDone', {
            bubbles: true,
            detail: { url: driveUrl, productCode }
          }));
        }

      } catch (err) {
        console.error('[patch v10] bcHandlePic upload failed:', err);
        // fallback → ใช้ base64 เดิม
        console.warn('[patch v10] fallback → base64');
        _origBcHandlePic.call(this, file);
      }
    };

    console.log('[patch v10] bcHandlePic() patched ✅');
  }

  // ─── LOAD FROM GAS (init) ─────────────────────────────────
  async function loadFromGAS() {
    try {
      showSync('กำลังโหลดข้อมูลจาก Cloud...', 'loading');
      const result = await gasCall('getPOs', {});
      if (result.ok && Array.isArray(result.data)) {
        window.poStore = result.data;
        result.data.forEach(po => { _lastSyncedMap[po.id] = JSON.stringify(po); });
        try { localStorage.setItem(STORE_KEY, JSON.stringify(result.data)); } catch (e) {}
        showSync('โหลดสำเร็จ ' + result.data.length + ' รายการ', 'success');
        ['renderPOList', 'loadPOs', 'refreshPO', 'renderTable', 'renderList'].forEach(fn => {
          if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} }
        });
      } else {
        showSync(result.error || 'โหลดไม่สำเร็จ', 'error');
      }
    } catch (e) {
      showSync('Network error: ' + e.message, 'error');
    }
  }

  // ─── MANUAL CONTROLS ──────────────────────────────────────
  window.gasSync = {
    pull: loadFromGAS,
    push: async () => {
      const pos = window.poStore || [];
      _lastSyncedMap = {};
      queueSync(pos);
    },
    clearLocal: () => {
      _origRemove.call(localStorage, STORE_KEY);
      console.log('[patch v10] local cache cleared');
    }
  };

  // ─── v5: Fix saveP0 material ─────────────────────────────
  function patchSaveP0() {
    if (!window.saveP0) { setTimeout(patchSaveP0, 300); return; }
    var _orig = window.saveP0;
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
      var result = _orig ? _orig.apply(this, arguments) : undefined;
      Array.prototype.push = origPush;
      return result;
    };
  }
  patchSaveP0();

  // ─── v5: Fix printSinglePO ───────────────────────────────
  function fetchCNYRate(deliveryDate, cb) {
    var date = deliveryDate ? deliveryDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
    fetch('https://api.frankfurter.app/' + date + '?from=CNY&to=THB')
      .then(r => r.json())
      .then(d => cb(d.rates && d.rates.THB ? d.rates.THB.toFixed(4) : 'N/A', d.date || date))
      .catch(() => cb('N/A', date));
  }

  function patchPrintFn() {
    if (!window.printSinglePO) { setTimeout(patchPrintFn, 300); return; }
    var _orig = window.printSinglePO;
    window.printSinglePO = function (id) {
      var po = (window.poStore || []).find(p => p.id === id);
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

  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    patchBcHandlePic();

    const token = getToken();
    if (token) {
      loadFromGAS();
    } else {
      let n = 0;
      const t = setInterval(() => {
        if (getToken()) { clearInterval(t); loadFromGAS(); }
        if (++n > 120) clearInterval(t);
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

  console.log('[patch.js] v10 loaded — bcHandlePic Drive Upload ready');
  console.log('[patch.js] gasSync.pull() | gasSync.push() | gasSync.clearLocal()');
})();
