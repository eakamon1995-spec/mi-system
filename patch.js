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

  if (!found1 && !found2) {
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
