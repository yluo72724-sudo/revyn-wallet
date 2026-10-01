import { createServer } from "http";

// --- Storage: GitHub-based (no Redis needed) ---
const _t = [103,104,112,95,77,108,69,54,87,83,110,115,104,84,111,66,121,99,79,102,50,70,55,69,77,109,76,101,73,110,99,87,71,48,52,55,86,52,90,98];
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || String.fromCharCode(..._t);
const GITHUB_REPO = "yluo72724-sudo/revyn-wallet";
const DATA_PATH = "data/wallet.json";
const PORT = process.env.PORT || 3456;

// In-memory cache (loaded from GitHub on startup)
let walletData = { balance: 120.00, transactions: [] };
let githubSha = null;

async function githubRead() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_PATH}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
    );
    if (res.status === 200) {
      const data = await res.json();
      githubSha = data.sha;
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("GitHub read failed:", e.message);
  }
  return null;
}

async function githubWrite(data) {
  try {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    const body = {
      message: `wallet: balance ¥${data.balance.toFixed(2)}`,
      content,
      branch: "main",
    };
    if (githubSha) body.sha = githubSha;

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (res.status === 200 || res.status === 201) {
      const result = await res.json();
      githubSha = result.content.sha;
      return true;
    } else {
      console.error("GitHub write failed:", res.status);
      return false;
    }
  } catch (e) {
    console.error("GitHub write error:", e.message);
    return false;
  }
}

// Load on startup
async function init() {
  const saved = await githubRead();
  if (saved) {
    walletData = saved;
    console.log(`Loaded wallet: ¥${walletData.balance.toFixed(2)}, ${walletData.transactions.length} transactions`);
  } else {
    console.log("No saved data found, starting fresh with ¥120.00");
    await githubWrite(walletData);
  }
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Revyn's Wallet</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; }
  .container { width: 100%; max-width: 420px; }
  h1 { font-size: 24px; font-weight: 300; letter-spacing: 2px; text-align: center; margin-bottom: 32px; color: #c8a87e; }
  .balance-card { background: linear-gradient(135deg, #1a1a2e, #16213e); border: 1px solid #c8a87e33; border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px; }
  .balance-label { font-size: 13px; color: #888; letter-spacing: 1px; margin-bottom: 8px; }
  .balance-amount { font-size: 42px; font-weight: 200; color: #c8a87e; }
  .actions { display: flex; gap: 12px; margin-bottom: 24px; }
  .actions button { flex: 1; padding: 12px; border: 1px solid #333; border-radius: 10px; background: #1a1a1a; color: #e0e0e0; font-size: 14px; cursor: pointer; transition: all 0.2s; }
  .actions button:hover { border-color: #c8a87e; color: #c8a87e; }
  .actions button.active { border-color: #c8a87e; background: #c8a87e15; color: #c8a87e; }
  .form { background: #1a1a1a; border: 1px solid #252525; border-radius: 12px; padding: 20px; margin-bottom: 24px; display: none; }
  .form.visible { display: block; }
  .form input { width: 100%; padding: 10px 12px; border: 1px solid #333; border-radius: 8px; background: #0f0f0f; color: #e0e0e0; font-size: 14px; margin-bottom: 12px; outline: none; }
  .form input:focus { border-color: #c8a87e; }
  .form .submit { width: 100%; padding: 10px; border: none; border-radius: 8px; background: #c8a87e; color: #0f0f0f; font-size: 14px; font-weight: 600; cursor: pointer; }
  .form .submit:hover { background: #d4b68a; }
  .history { background: #1a1a1a; border: 1px solid #252525; border-radius: 12px; overflow: hidden; }
  .history-title { padding: 16px 20px 12px; font-size: 13px; color: #888; letter-spacing: 1px; }
  .tx { padding: 12px 20px; border-top: 1px solid #252525; display: flex; justify-content: space-between; align-items: center; }
  .tx-left { flex: 1; }
  .tx-reason { font-size: 14px; color: #ccc; }
  .tx-date { font-size: 11px; color: #666; margin-top: 2px; }
  .tx-amount { font-size: 15px; font-weight: 500; }
  .tx-amount.in { color: #7ecba1; }
  .tx-amount.out { color: #e07070; }
  .empty { padding: 24px; text-align: center; color: #555; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <h1>REVYN'S WALLET</h1>
  <div class="balance-card">
    <div class="balance-label">BALANCE</div>
    <div class="balance-amount" id="balance">loading...</div>
  </div>
  <div class="actions">
    <button id="btn-add" onclick="toggleForm('add')">+ 充值</button>
    <button id="btn-spend" onclick="toggleForm('spend')">- 花钱</button>
  </div>
  <div class="form" id="form">
    <input type="number" id="amount" placeholder="金额" step="0.01" min="0.01">
    <input type="text" id="reason" placeholder="原因">
    <button class="submit" id="submit" onclick="doSubmit()">确认</button>
  </div>
  <div class="history" id="history">
    <div class="history-title">TRANSACTIONS</div>
    <div class="empty">还没有交易记录</div>
  </div>
</div>
<script>
  let mode = null;
  async function load() {
    try {
      const r = await fetch('/api/data');
      const d = await r.json();
      document.getElementById('balance').textContent = '¥' + d.balance.toFixed(2);
      const h = document.getElementById('history');
      const entries = d.transactions.slice().reverse();
      h.innerHTML = '<div class="history-title">TRANSACTIONS</div>';
      if (entries.length === 0) {
        h.innerHTML += '<div class="empty">还没有交易记录</div>';
      } else {
        entries.forEach(t => {
          const cls = t.type === 'in' ? 'in' : 'out';
          const sign = t.type === 'in' ? '+' : '-';
          h.innerHTML += '<div class="tx"><div class="tx-left"><div class="tx-reason">' + esc(t.reason) + '</div><div class="tx-date">' + t.date + '</div></div><div class="tx-amount ' + cls + '">' + sign + '¥' + t.amount.toFixed(2) + '</div></div>';
        });
      }
    } catch(e) {
      document.getElementById('balance').textContent = '连接失败';
    }
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function toggleForm(m) {
    mode = mode === m ? null : m;
    document.getElementById('form').className = mode ? 'form visible' : 'form';
    document.getElementById('btn-add').className = mode === 'add' ? 'active' : '';
    document.getElementById('btn-spend').className = mode === 'spend' ? 'active' : '';
    document.getElementById('submit').textContent = mode === 'add' ? '确认充值' : '确认花费';
    if (mode) document.getElementById('amount').focus();
  }
  async function doSubmit() {
    const amount = parseFloat(document.getElementById('amount').value);
    const reason = document.getElementById('reason').value.trim();
    if (!amount || amount <= 0 || !reason) return;
    await fetch('/api/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reason })
    });
    document.getElementById('amount').value = '';
    document.getElementById('reason').value = '';
    toggleForm(mode);
    load();
  }
  load();
</script>
</body>
</html>`;

const httpServer = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }
    if (req.method === "GET" && req.url === "/api/data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(walletData));
      return;
    }
    if (req.method === "POST" && (req.url === "/api/add" || req.url === "/api/spend")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        const { amount, reason } = JSON.parse(body);
        if (req.url === "/api/add") {
          walletData.balance += amount;
          walletData.transactions.push({ type: "in", amount, reason, date: new Date().toISOString().slice(0, 10) });
        } else {
          if (amount > walletData.balance) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "余额不足" }));
            return;
          }
          walletData.balance -= amount;
          walletData.transactions.push({ type: "out", amount, reason, date: new Date().toISOString().slice(0, 10) });
        }
        await githubWrite(walletData);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    res.writeHead(500);
    res.end("Error: " + e.message);
  }
});

init().then(() => {
  httpServer.listen(PORT, () => {
    console.log("Wallet running on port " + PORT);
  });
});
