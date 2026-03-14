// patch.js v12 - savePO material via apiCall intercept
(function () {
  'use strict';

  // -- 1. CNY Rate --
  var _rateCache = {};
  function fetchRate(date, cb) {
    var d = (date || new Date().toISOString()).substring(0, 10);
    if (_rateCache[d]) { cb(_rateCache[d]); return; }
    fetch('https://api.frankfurter.app/' + d + '?from=CNY&to=THB')
      .then(function(r) { return r.json(); })
      .then(function(j) {
        var r = j.rates && j.rates.THB
          ? { rate: j.rates.THB.toFixed(4), date: j.date || d, ok: true }
          : { rate: 'N/A', date: d, ok: false };
        _rateCache[d] = r;
        cb(r);
      })
      .catch(function() { cb({ rate: 'N/A', date: d, ok: false }); });
  }

  // -- 2. placeholder (merged into hookSaveViaApi below) --

  // -- 3. intercept apiCall savePO to inject material from DOM --
  function hookSaveViaApi() {
    if (typeof window.apiCall !== 'function') { setTimeout(hookSaveViaApi, 200); return; }
    if (window._patchSaveDone) return;
    var _origApi = window.apiCall;
    window.apiCall = function(action, payload, cb) {
      if (action === 'getCNYRate') {
        var _r = { rate: 'N/A', date: (payload && payload.date) || new Date().toISOString().substring(0,10), ok: false };
        fetchRate(payload && payload.date, function(r) {
          if (typeof cb === 'function') cb({ ok: r.ok, rate: r.rate, date: r.date });
        });
        return Promise.resolve(_r);
      }
      if (action === 'savePO' && payload && payload.items) {
        var rows = document.querySelectorAll('#poItemsBody tr');
        payload.items.forEach(function(item) {
          for (var i = 0; i < rows.length; i++) {
            var en = rows[i].querySelector('.po-engname');
            if (en && en.value === item.engName) {
              var mat = rows[i].querySelector('.po-material');
              item.material = mat ? mat.value : '';
              break;
            }
          }
        });
      }
      return _origApi.apply(this, arguments);
    };
    window._patchApiDone = true;
    window._patchSaveDone = true;
    console.log('[patch.js v12] savePO material hook ready');
  }
  hookSaveViaApi();

  // -- 4. buildPrintHTML --
  function buildPrintHTML(po, sc, rateStr, rateDate) {
    var comVal = (po.com != null ? po.com : 2) / 100;
    var cols = [
      { k: 'seq',       label: 'No.',        w: '28px',  align: 'center' },
      { k: 'agent',     label: 'Agent',      w: '40px',  align: 'center' },
      { k: 'pic',       label: 'Pic',        w: '62px',  align: 'center' },
      { k: 'code',      label: 'Code',       w: '70px',  align: 'center' },
      { k: 'bcPcs',     label: 'Bc/Pcs',     w: '36px',  align: 'center' },
      { k: 'bcCtn',     label: 'Bc/Ctn',     w: '36px',  align: 'center' },
      { k: 'fac',       label: 'Fac',        w: '36px',  align: 'center' },
      { k: 'thaiName',  label: 'Thai Name',  w: '110px', align: 'left'   },
      { k: 'engName',   label: 'Eng Name',   w: '110px', align: 'left'   },
      { k: 'material',  label: 'Material',   w: '80px',  align: 'left'   },
      { k: 'ex',        label: 'Ex-Work',    w: '56px',  align: 'right'  },
      { k: 'p2',        label: 'P+2%',       w: '60px',  align: 'right'  },
      { k: 'pcsCtn',    label: 'Pcs/Ctn',    w: '44px',  align: 'right'  },
      { k: 'ttCtn',     label: 'Tt.Ctn',     w: '42px',  align: 'right'  },
      { k: 'ttPcs',     label: 'Tt.Pcs',     w: '52px',  align: 'right'  },
      { k: 'ctnSize',   label: 'Ctn Size',   w: '56px',  align: 'center' },
      { k: 'ctnPrice',  label: 'Ctn Price',  w: '62px',  align: 'right'  },
      { k: 'amount',    label: 'Amount',     w: '70px',  align: 'right'  },
      { k: 'delivDate', label: 'Deliv.Date', w: '64px',  align: 'center' },
      { k: 'pack',      label: 'Pack',       w: '40px',  align: 'center' },
      { k: 'remFac',    label: 'Rem.Fac',    w: '70px',  align: 'left'   },
      { k: 'remDesign', label: 'Rem.Design', w: '70px',  align: 'left'   },
      { k: 'designRef', label: 'Design Ref', w: '60px',  align: 'left'   }
    ];
    cols[11].label = 'P+' + (po.com != null ? po.com : 2) + '%';
    var numCols = cols.length;

    var dateF = po.date
      ? new Date(po.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '';
    var delivF = po.deliveryDate
      ? new Date(po.deliveryDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '';

    var thHtml = '<tr>' + cols.map(function(c) {
      return '<th style="width:' + c.w + ';text-align:' + c.align + '">' + c.label + '</th>';
    }).join('') + '</tr>';

    var totalAmt = 0, totalCtn = 0, totalPcs = 0;
    var tbHtml = (po.items || []).map(function(it) {
      var ex  = parseFloat(it.ex)  || 0;
      var p2  = parseFloat(it.p2)  || (ex * (1 + comVal));
      var amt = parseFloat(it.amount) || 0;
      totalAmt += amt;
      totalCtn += parseInt(it.ttCtn) || 0;
      totalPcs += parseInt(it.ttPcs) || 0;
      var picHtml = it.pic
        ? '<img src="' + it.pic + '" style="max-width:58px;max-height:52px;display:block;margin:auto" onerror="this.style.display='none'">'
        : '&#8212;';
      var delivIt = it.delivDate
        ? new Date(it.delivDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '';
      return '<tr>' + [
        it.seq || '', it.agent || '', picHtml,
        '<span style="font-weight:600;color:#1a6cad">' + (it.code || '') + '</span>',
        it.bcPcs || '', it.bcCtn || '', it.fac || '',
        it.thaiName || '', it.engName || '', it.material || '',
        '\u00a5' + ex.toFixed(3), '\u00a5' + p2.toFixed(3),
        it.pcsCtn || '', it.ttCtn || '', it.ttPcs || '', it.ctnSize || '',
        '\u00a5' + (parseFloat(it.ctnPrice) || 0).toFixed(4),
        '\u00a5' + amt.toFixed(4),
        delivIt, it.pack || '', it.remFac || '', it.remDesign || '', it.designRef || ''
      ].map(function(v, i) {
        return '<td style="text-align:' + cols[i].align + ';vertical-align:middle;padding:3px 4px">' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var tfHtml = '<tr class="tfoot">'
      + '<td colspan="' + (numCols - 5) + '" style="text-align:right;padding-right:8px">Total</td>'
      + '<td style="text-align:right">' + totalCtn + '</td>'
      + '<td style="text-align:right">' + totalPcs + '</td>'
      + '<td></td><td></td>'
      + '<td style="text-align:right">\u00a5' + totalAmt.toFixed(4) + '</td>'
      + '<td colspan="5"></td></tr>';

    var supBar = (sc.name || sc.contact || sc.wechat || sc.phone || sc.payment)
      ? '<div class="sup-bar">'
        + (sc.name    ? '<span><b>Supplier:</b> ' + sc.name + '</span>' : '')
        + (sc.contact ? '<span><b>Contact:</b> ' + sc.contact + '</span>' : '')
        + (sc.wechat  ? '<span><b>WeChat:</b> ' + sc.wechat + '</span>' : '')
        + (sc.phone   ? '<span><b>Tel:</b> ' + sc.phone + '</span>' : '')
        + (sc.payment ? '<span><b>Payment:</b> ' + sc.payment + '</span>' : '')
        + (sc.address ? '<span><b>Addr:</b> ' + sc.address + '</span>' : '')
        + '</div>' : '';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<title>PO ' + po.id + '</title><style>'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      + 'body{font-family:Arial,sans-serif;font-size:9px;padding:8px;color:#111}'
      + '@page{size:A4 landscape;margin:8mm}'
      + '.po-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}'
      + '.po-title{font-size:18px;font-weight:700}'
      + '.po-meta{text-align:right;font-size:10px;color:#333;line-height:1.8}'
      + '.po-num{font-size:13px;font-weight:700}'
      + '.po-date{font-size:10px}'
      + '.rate-pill{display:inline-block;margin-top:4px;padding:2px 8px;background:#f0f4ff;border:1px solid #c5d0f0;border-radius:4px;font-size:9px;color:#2a4caa}'
      + '.sup-bar{display:flex;flex-wrap:wrap;gap:12px;padding:4px 8px;background:#f7f6f2;border-radius:4px;margin-bottom:6px;font-size:9px}'
      + 'table{width:100%;border-collapse:collapse}'
      + 'th{background:#1a1814;color:#fff;padding:4px 3px;font-size:8px;border:1px solid #555;white-space:nowrap}'
      + 'td{border:1px solid #ccc;font-size:8.5px;padding:3px 4px;line-height:1.3}'
      + '.tfoot td{background:#f7f6f2!important;font-weight:700;border-top:2px solid #1a1814}'
      + '@media print{body{padding:0}button{display:none}}'
      + '</style></head><body>'
      + '<div class="po-header">'
      + '<div><div class="po-title">PURCHASE ORDER</div>'
      + '<div style="font-size:11px;margin-top:2px;color:#555">V.R.TOYS Co., Ltd.</div></div>'
      + '<div class="po-meta">'
      + '<div class="po-num">PO No. : ' + po.id + '</div>'
      + '<div class="po-date">Date : ' + dateF + '</div>'
      + (delivF ? '<div class="po-date">Expected Delivery : ' + delivF + '</div>' : '')
      + (po.department ? '<div class="po-date">Dept : ' + po.department + '</div>' : '')
      + '<div class="rate-pill">CNY/THB : ' + rateStr + ' (' + rateDate + ')</div>'
      + '</div></div>'
      + supBar
      + '<table><thead>' + thHtml + '</thead>'
      + '<tbody>' + tbHtml + '</tbody>'
      + '<tfoot>' + tfHtml + '</tfoot></table>'
      + '<div style="margin-top:8px;font-size:8px;color:#888;text-align:right">Printed '
      + new Date().toLocaleString('en-GB') + '</div>'
      + '<script>window.onload=function(){window.print();}<\/script>'
      + '</body></html>';
  }

  // -- 5. printSinglePO: use Promise-based apiCall --
  function hookPrint() {
    if (typeof window.printSinglePO !== 'function') { setTimeout(hookPrint, 300); return; }
    if (window._patchPrintDone) return;
    window._patchPrintDone = true;
    window.printSinglePO = function(id) {
      window.apiCall('getPOs', {}).then(function(res) {
        if (!res || !res.ok) { alert('Cannot load POs: ' + (res && res.error || 'unknown')); return; }
        var po = (res.data || []).find(function(p) { return p.id === id; });
        if (!po) { alert('PO not found: ' + id); return; }
        var sc = po.supCustom || {};
        var delDate = po.deliveryDate
          ? String(po.deliveryDate).substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        fetchRate(delDate, function(r) {
          var html = buildPrintHTML(po, sc, r.rate, r.date);
          var win = window.open('', '_blank', 'width=1200,height=750');
          if (!win) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
          win.document.open();
          win.document.write(html);
          win.document.close();
        });
      }).catch(function(e) { alert('Error: ' + e.message); });
    };
    console.log('[patch.js v12] printSinglePO ready');
  }
  hookPrint();

  console.log('[patch.js v12] loaded');
})();
