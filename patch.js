// patch.js - MI System patches

(function() {
  'use strict';

  // Fix 1: saveP0 - include material in items.push()
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

  // Fix 2: printSinglePO - add material td, fix colspan 11->12
  const _origPrint = window.printSinglePO;
  window.printSinglePO = function(id) {
    const origOpen = window.open;
    window.open = function(url, target, features) {
      const win = origOpen.call(window, url, target, features);
      window.open = origOpen;
      return win;
    };
    // Monkey-patch document.write to intercept HTML
    const origWrite = Document.prototype.write;
    Document.prototype.write = function(html) {
      // Add material td after engName td
      html = html.replace(/<td>\${it\.engName\|\|''}\/<\/td>/g,
        '<td>${it.engName||\'\'}</td><td>${it.material||\'\'}</td>');
      // Fix colspan
      html = html.replace(/colspan=\"11\"/, 'colspan="12"');
      Document.prototype.write = origWrite;
      return origWrite.call(this, html);
    };
    return _origPrint ? _origPrint.call(window, id) : undefined;
  };

  console.log('[patch.js] loaded OK v2');
})();