// patch.js - MI System patches v3

(function() {
  'use strict';

  // Fix 1: saveP0 - include material in items.push()
  var _orig = window.saveP0;
  window.saveP0 = function() {
    var origPush = Array.prototype.push;
    Array.prototype.push = function(obj) {
      if (obj && typeof obj === 'object' && 'seq' in obj && 'engName' in obj && !('material' in obj)) {
        var rows = document.querySelectorAll('#poItemsTable tbody tr');
        for (var i = 0; i < rows.length; i++) {
          var tr = rows[i];
          if (tr.querySelector('.po-engname') && tr.querySelector('.po-engname').value === obj.engName) {
            var matEl = tr.querySelector('.po-material');
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

  // Fix 2: printSinglePO - patch via toString/eval
  function patchPrintFn() {
    if (!window.printSinglePO) { setTimeout(patchPrintFn, 200); return; }
    var src = window.printSinglePO.toString();
    src = src.replace("<td>${it.engName||''}</td>",
      "<td>${it.engName||''}</td>\n      <td>${it.material||''}</td>");
    src = src.replace('colspan="11"', 'colspan="12"');
    var match = src.match(/^function\s+printSinglePO\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
    if (match) {
      window.printSinglePO = new Function(match[1], match[2]);
      console.log('[patch.js] printSinglePO patched OK');
    }
  }
  patchPrintFn();

  console.log('[patch.js] loaded v3');
})();