// patch.js - MI System patches
// All future fixes go here. Never touch index.html.

(function() {
  'use strict';

  // Fix saveP0: include material in items.push()
  const _orig = window.saveP0;
  window.saveP0 = function() {
    const origPush = Array.prototype.push;
    Array.prototype.push = function(obj) {
      if (obj && typeof obj === 'object' && 'seq' in obj && 'engName' in obj && !('material' in obj)) {
        const rows = document.querySelectorAll('#poItemsTable tbody tr');
        for (const tr of rows) {
          if (tr.querySelector('.po-engname')?.value === obj.engName) {
            obj.material = tr.querySelector('.po-material')?.value || '';
            break;
          }
        }
      }
      return origPush.apply(this, arguments);
    };
    const result = _orig ? _orig.apply(this, arguments) : undefined;
    Array.prototype.push = origPush;
    return result;
  };

  console.log('[patch.js] loaded OK');
})();

