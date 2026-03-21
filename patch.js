// ── RUNTIME PATCH (runs automatically when page loads) ───────────────────────

// FIX 4: Auto-set default GAS URL + block skipLogin + MutationObserver (รองรับ SPA re-render)
(function() {
  var D = 'https://script.google.com/macros/s/AKfycbw4PeI5IhPOWTZSxUKRyZESKg3Dp9s_UzZPJF3fHVyv5vnewY8dNvyaIJY4VQwUqpQRXw/exec';

  // 1) Auto-set URL สำหรับเครื่องใหม่ที่ยังไม่เคยตั้งค่า
  if (!localStorage.getItem('mi_erpUrl')) {
    localStorage.setItem('mi_erpUrl', D);
    console.log('[patch] Auto-set mi_erpUrl for new device');
  }

  // 2) Override window.skipLogin — ถ้า mi_erpUrl ตั้งค่าแล้ว ห้ามเข้า offline mode เด็ดขาด
  //    ทำงานได้ทุกครั้งที่ skipLogin ถูกเรียก ไม่ว่าจะกดกี่ครั้งหรือ re-login กี่รอบ
  window.addEventListener('load', function() {
    var _orig = window.skipLogin;
    Object.defineProperty(window, 'skipLogin', {
      get: function() {
        return function() {
          if (localStorage.getItem('mi_erpUrl')) {
            console.log('[patch] skipLogin blocked — use online login instead');
            return; // ป้องกัน offline mode
          }
          if (typeof _orig === 'function') _orig();
        };
      },
      configurable: true
    });
    console.log('[patch] skipLogin override installed');
  });

  // 3) MutationObserver — ซ่อนปุ่ม Offline และ hint ทุกครั้งที่ DOM เปลี่ยน
  //    ครอบคลุม: login ครั้งแรก, logout+re-login, สลับ account
  function hideOfflineUI() {
    // ซ่อน hint "ต้องตั้ง API URL"
    document.querySelectorAll('*').forEach(function(el) {
      if (!el.children.length && el.textContent &&
          (el.textContent.includes('ต้องตั้ง API URL') || el.textContent.includes('ตั้งค่า API URL'))) {
        if (el.parentElement) el.parentElement.style.display = 'none';
      }
    });
    // ซ่อนปุ่ม Offline ทุกปุ่มที่มี text "Offline" หรือ "ออฟไลน์"
    document.querySelectorAll('button, a').forEach(function(el) {
      if (el.textContent.includes('Offline') || el.textContent.includes('ออฟไลน์')) {
        el.style.display = 'none';
      }
    });
  }

  function startObserver() {
    hideOfflineUI();
    var obs = new MutationObserver(function(muts) {
      if (muts.some(function(m) { return m.addedNodes.length > 0; })) {
        hideOfflineUI();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('[patch] MutationObserver started — Offline button blocked');
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }
})();

// FIX 5: Internet disconnect/reconnect protection
(function() {
  var banner = document.createElement('div');
  banner.id = 'net-offline-banner';
  banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-family:"Sarabun",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);';
  banner.innerHTML = '🔴 <b>ไม่มีอินเทอร์เน็ต</b> — ระบบหยุด sync ชั่วคราว — จะกลับมาอัตโนมัติเมื่อเชื่อมต่อใหม่';
  document.body.appendChild(banner);
  window.addEventListener('offline', function() {
    banner.style.display = 'block';
    console.log('[patch] Internet offline — sync paused');
  });
  window.addEventListener('online', function() {
    banner.style.display = 'none';
    console.log('[patch] Internet reconnected — resuming sync');
    setTimeout(function() {
      if (typeof window.pollSync === 'function') window.pollSync();
      else if (typeof window.manualSync === 'function') window.manualSync();
    }, 1500);
  });
  if (!navigator.onLine) banner.style.display = 'block';
})();

// ── CONSOLE UTILITY (run patchMISystem('token') to patch index.html) ───────────
// ============================================================
//  patch.js — Run in browser console on github.com while logged in
//  Steps:
//  1. Go to https://github.com/settings/tokens → create token with 'repo' scope
//  2. Open browser console on github.com
//  3. Paste this script and replace YOUR_TOKEN_HERE
// ============================================================

async function patchMISystem(token) {
  const owner = 'eakamon1995-spec';
  const repo = 'mi-system';
  const path = 'index.html';
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  console.log('Step 1: Fetching file content...');
  const rawResp = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + path);
  let content = await rawResp.text();
  console.log('Fetched:', content.length, 'chars');

  // FIX 1: เพิ่ม material column
  const old1 = `${it.engName||''}</td>\n      <td style="text-align:right">`;
  const new1 = `${it.engName||''}</td>\n      <td>${it.material||''}</td>\n      <td style="text-align:right">`;
  const found1 = content.includes(old1);
  console.log('Fix1 (material) found:', found1);
  if (found1) content = content.replace(old1, new1);

  // FIX 2: แก้ ttCtn floating point
  const old2 = '${it.ttCtn||0}</td>';
  const new2 = '${parseFloat((it.ttCtn||0).toFixed(3))}</td>';
  const found2 = content.includes(old2);
  console.log('Fix2 (ttCtn) found:', found2);
  if (found2) content = content.replace(old2, new2);
  // FIX 3: GAS 503 retry (แก้ Network error ถาวร)
  const old3 = "    return { ok: false, error: 'Network error: ' + e.message };\n  }\n}";
  const new3 = "    try{await new Promise(r=>setTimeout(r,3000));const _r=await fetch(erpApiUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body),redirect:'follow',mode:'cors'});const _t=await _r.text();try{return JSON.parse(_t);}catch{return{ok:false,error:'Invalid JSON on retry'};}}catch(_e){return{ok:false,error:'Network error: '+_e.message};};\n  }\n}";
  const found3 = content.includes(old3);
  console.log('Fix3 (retry) found:', found3);
  if (found3) content = content.replace(old3, new3);
  if (!found1 && !found2 && !found3) {
    console.error('Neither fix found — already patched or pattern changed');
    return;
  }

  console.log('Step 2: Getting current file SHA...');
  const infoResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/refs/heads/main', { headers });
  const refData = await infoResp.json();
  const latestCommitSha = refData.object.sha;
  console.log('Latest commit:', latestCommitSha);

  console.log('Step 3: Creating blob...');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);

  const blobResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/blobs', {
    method: 'POST', headers,
    body: JSON.stringify({ content: b64, encoding: 'base64' })
  });
  const blobData = await blobResp.json();
  console.log('Blob SHA:', blobData.sha);

  console.log('Step 4: Getting base tree...');
  const commitResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/commits/' + latestCommitSha, { headers });
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;

  console.log('Step 5: Creating new tree...');
  const treeResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees', {
    method: 'POST', headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{ path, mode: '100644', type: 'blob', sha: blobData.sha }]
    })
  });
  const treeData = await treeResp.json();
  console.log('New tree SHA:', treeData.sha);

  console.log('Step 6: Creating commit...');
  const newCommitResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/commits', {
    method: 'POST', headers,
    body: JSON.stringify({
      message: 'fix: add material column in print table, fix ttCtn float',
      tree: treeData.sha,
      parents: [latestCommitSha]
    })
  });
  const newCommitData = await newCommitResp.json();
  console.log('New commit SHA:', newCommitData.sha);

  console.log('Step 7: Updating ref...');
  const updateResp = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/refs/heads/main', {
    method: 'PATCH', headers,
    body: JSON.stringify({ sha: newCommitData.sha, force: false })
  });
  const updateData = await updateResp.json();
  console.log('Done! Ref updated:', updateData.object?.sha);
  console.log('View at: https://github.com/' + owner + '/' + repo + '/commit/' + newCommitData.sha);
}

// ใส่ token แล้วรัน:
// patchMISystem('ghp_yourTokenHere');
