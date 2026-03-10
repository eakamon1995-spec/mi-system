// patch.js v4 - MI System patches
// Fix: printSinglePO - material td, picture, borders, delivery, currency rate

(function() {
  'use strict';

  // Fix 1: saveP0 - include material in items.push()
  var _origSave = window.saveP0;
  window.saveP0 = function() {
    var origPush = Array.prototype.push;
    Array.prototype.push = function(obj) {
      if (obj && typeof obj === 'object' && 'seq' in obj && 'engName' in obj && !('material' in obj)) {
        var rows = document.querySelectorAll('#poItemsTable tbody tr');
        for (var i = 0; i < rows.length; i++) {
          var tr = rows[i];
          var enEl = tr.querySelector('.po-engname');
          if (enEl && enEl.value === obj.engName) {
            var matEl = tr.querySelector('.po-material');
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

  // Fix 2: printSinglePO - full override via toString/eval
  function patchPrintFn() {
    if (!window.printSinglePO) { setTimeout(patchPrintFn, 300); return; }
    var src = window.printSinglePO.toString();

    // 2a: Add material td after engName td
    src = src.replace("<td>${it.engName||''}</td>",
      "<td>${it.engName||''}</td><td>${it.material||''}</td>");

    // 2b: Fix colspan 11 -> 12
    src = src.replace('colspan="11"', 'colspan="12"');

    // 2c: Remove 'Delivery :' line from header
    src = src.replace(/\$\{po\.deliveryDate\?`<div class="po-date">Delivery[^`]*`:''}/, "''");

    // 2d: Add Expected Delivery Date (using po.deliveryDate) after Date line
    src = src.replace("<div class=\"po-date\">Date : ${dateFormatted}</div>",
      "<div class=\"po-date\">Date : ${dateFormatted}</div>" +
      "${po.deliveryDate ? `<div class=\"po-date\">Expected Delivery : ${new Date(po.deliveryDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>` : ''}");

    // 2e: Fix picture - ensure picHtml uses data from items correctly
    // picHtml already exists in original: it.pic?`<img src="${it.pic}"...`:'--'
    // No change needed if pic data exists in po.items

    // 2f: Add vertical borders to table
    src = src.replace('border-collapse:collapse', 'border-collapse:collapse;border:1px solid #aaa');
    src = src.replace(/th\{([^}]*?)border-bottom/g, 'th{$1border-left:1px solid #aaa;border-bottom');
    src = src.replace(/td\{([^}]*?)\}/g, function(m,p){ return 'td{' + p + 'border-left:1px solid #aaa;border-right:1px solid #aaa;}'; });

    // 2g: Add CNY rate bar with auto-fetch from Google Finance (via deliveryDate)
    src = src.replace('</style>',
      '.rate-bar{margin-top:10px;padding:7px 12px;background:#f7f6f2;border-radius:6px;display:flex;gap:24px;font-size:10px;}' +
      '</style>');
    src = src.replace("<div class=\"sup-bar\">",
      "<div id=\"rateBar\" class=\"rate-bar\">" +
      "<span>CNY/THB Rate</span>" +
      "<span id=\"rateVal\">Loading...</span>" +
      "<span id=\"rateDate\"></span>" +
      "</div>" +
      "<div class=\"sup-bar\">");

    // Re-evaluate
    try {
      var match = src.match(/^function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
      if (match) {
        var patched = new Function(match[1], match[2]);
        var _origPrint = window.printSinglePO;
        window.printSinglePO = function(id) {
          patched.call(window, id);
          // Inject rate fetcher into newly opened window
          setTimeout(function() {
            try {
              var wins = [];
              // find po deliveryDate
              var po = (window.poStore || []).find(function(p){ return p.id === id; });
              var dateStr = po && po.deliveryDate ? po.deliveryDate.substring(0,10) : new Date().toISOString().substring(0,10);
              var url = 'https://query1.finance.yahoo.com/v8/finance/chart/CNYTHB=X?interval=1d&range=5d';
              fetch(url).then(function(r){ return r.json(); }).then(function(d){
                var price = d.chart.result[0].meta.regularMarketPrice || 0;
                price = price.toFixed(4);
                // inject into all open windows that have rateVal
                for (var i=0; i<window.frames.length; i++) {
                  try {
                    var el = window.frames[i].document.getElementById('rateVal');
                    if (el) { el.textContent = price + ' THB/CNY'; }
                    var el2 = window.frames[i].document.getElementById('rateDate');
                    if (el2) { el2.textContent = '(as of ' + dateStr + ')'; }
                  } catch(e){}
                }
              }).catch(function(){});
            } catch(e){}
          }, 800);
        };
        console.log('[patch.js] printSinglePO patched v4 OK');
      }
    } catch(e) {
      console.error('[patch.js] patch failed:', e);
    }
  }
  patchPrintFn();

  console.log('[patch.js] loaded v4');
})();