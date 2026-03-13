// patch.js v6
(function() {
  'use strict';

  // ======== Fix 1: intercept getCNYRate - fetch direct, bypass Apps Script ========
  function fetchCNYRateDirect(date, cb) {
    var d = date ? date.substring(0,10) : new Date().toISOString().substring(0,10);
    fetch('https://api.frankfurter.app/' + d + '?from=CNY&to=THB')
      .then(function(r){ return r.json(); })
      .then(function(j){
        var rate = j.rates && j.rates.THB ? parseFloat(j.rates.THB.toFixed(4)) : null;
        cb({ ok: true, rate: rate, date: j.date || d });
      })
      .catch(function(e){ cb({ ok: false, error: e.message }); });
  }

  // Patch apiCall to intercept getCNYRate
  var _origApiCall = window.apiCall;
  function hookApiCall() {
    if (typeof window.apiCall !== 'function') { setTimeout(hookApiCall, 200); return; }
    if (window._apiCallPatched) return;
    _origApiCall = window.apiCall;
    window.apiCall = function(action, payload, cb) {
      if (action === 'getCNYRate') {
        var date = payload && payload.date ? payload.date : new Date().toISOString().substring(0,10);
        fetchCNYRateDirect(date, function(result) {
          if (typeof cb === 'function') cb(result);
        });
        return;
      }
      return _origApiCall.apply(this, arguments);
    };
    window._apiCallPatched = true;
    console.log('[patch.js] apiCall(getCNYRate) intercepted -> frankfurter.app');
  }
  hookApiCall();

  // ======== Fix 2: saveP0 - include material ========
  var _origSave = window.saveP0;
  function hookSave() {
    if (typeof window.saveP0 !== 'function') { setTimeout(hookSave, 200); return; }
    _origSave = window.saveP0;
    window.saveP0 = function() {
      var origPush = Array.prototype.push;
      Array.prototype.push = function(obj) {
        if (obj && typeof obj === 'object' && 'seq' in obj && 'engName' in obj && !('material' in obj)) {
          var rows = document.querySelectorAll('#poItemsTable tbody tr');
          for (var i=0; i<rows.length; i++) {
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
    console.log('[patch.js] saveP0 patched');
  }
  hookSave();

  // ======== Fix 3: printSinglePO ========
  function patchPrintFn() {
    if (typeof window.printSinglePO !== 'function') { setTimeout(patchPrintFn, 300); return; }
    var _orig = window.printSinglePO;
    window.printSinglePO = function(id) {
      var po = (window.poStore||[]).find(function(p){ return p.id===id; });
      var delDate = po && po.deliveryDate ? po.deliveryDate.substring(0,10) : new Date().toISOString().substring(0,10);
      fetchCNYRateDirect(delDate, function(rateObj) {
        var rateStr = rateObj.ok && rateObj.rate ? rateObj.rate + ' THB/CNY (' + rateObj.date + ')' : 'N/A';
        var src = _orig.toString();
        // material td after engName td
        src = src.split("<td>${it.engName||''}</td>").join("<td>${it.engName||''}</td><td>${it.material||''}</td>");
        // colspan 11->12
        src = src.split('colspan="11"').join('colspan="12"');
        // remove old Delivery line
        src = src.replace(/\$\{po\.deliveryDate\?`<div class="po-date">Delivery[^`]*`:''\}/, "''");
        // inject Expected Delivery + Rate after Date line
        var oldD = '<div class=\\"po-date\\">Date : ${dateFormatted}</div>';
        var newD = oldD +
          '${po.deliveryDate?`<div class=\\"po-date\\">Expected Delivery : ${new Date(po.deliveryDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>`:""}' +
          '<div class=\\"po-date\\">CNY/THB Rate : ' + rateStr + '</div>';
        src = src.split(oldD).join(newD);
        // vertical borders
        src = src.split('</style>').join('th,td{border:1px solid #ccc!important;}</style>');
        try {
          var m = src.match(/^function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
          if (m) new Function(m[1], m[2]).call(window, id);
          else _orig.call(window, id);
        } catch(e) { console.error('[patch] print err', e); _orig.call(window, id); }
      });
    };
    console.log('[patch.js] printSinglePO patched v6');
  }
  patchPrintFn();

  console.log('[patch.js] loaded v6');
})();
