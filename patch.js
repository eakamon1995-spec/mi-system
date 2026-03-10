// patch.js v5
(function() {
  'use strict';

  function fetchCNYRate(deliveryDate, cb) {
    var date = deliveryDate ? deliveryDate.substring(0,10) : new Date().toISOString().substring(0,10);
    var url = "https://api.frankfurter.app/" + date + "?from=CNY&to=THB";
    fetch(url).then(function(r){ return r.json(); })
    .then(function(d) {
      var rate = d.rates && d.rates.THB ? d.rates.THB.toFixed(4) : "N/A";
      cb(rate, d.date || date);
    }).catch(function() { cb("N/A", date); });
  }

  // Fix 1: saveP0 material
  var _origSave = window.saveP0;
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

  // Fix 2: printSinglePO
  function patchPrintFn() {
    if (!window.printSinglePO) { setTimeout(patchPrintFn, 300); return; }
    var _orig = window.printSinglePO;
    window.printSinglePO = function(id) {
      var po = (window.poStore||[]).find(function(p){ return p.id===id; });
      var delDate = po && po.deliveryDate ? po.deliveryDate.substring(0,10) : new Date().toISOString().substring(0,10);
      fetchCNYRate(delDate, function(rate, rateDate) {
        var src = _orig.toString();
        // material td
        src = src.split("<td>${it.engName||''}</td>").join("<td>${it.engName||''}</td><td>${it.material||''}</td>");
        // colspan
        src = src.split('colspan="11"').join('colspan="12"');
        // remove Delivery line
        src = src.replace(/\$\{po\.deliveryDate\?`<div class="po-date">Delivery[^`]*`:''}/, "''");
        // Expected Delivery + Rate after Date line
        var oldDate = '<div class=\"po-date\">Date : ${dateFormatted}</div>';
        var newDate = oldDate +
          '${po.deliveryDate?`<div class=\"po-date\">Expected Delivery : ${new Date(po.deliveryDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>`:""}' +
          '<div class=\"po-date\">CNY/THB Rate : ' + rate + ' (' + rateDate + ')</div>';
        src = src.split(oldDate).join(newDate);
        // vertical borders via injected style
        src = src.split("</style>").join("th,td{border:1px solid #ccc!important;}</style>");
        // eval and call
        try {
          var m = src.match(/^function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
          if (m) new Function(m[1], m[2]).call(window, id);
          else _orig.call(window, id);
        } catch(e) { console.error('[patch] err',e); _orig.call(window,id); }
      });
    };
    console.log('[patch.js] v5 ready');
  }
  patchPrintFn();
  console.log('[patch.js] loaded v5');
})();