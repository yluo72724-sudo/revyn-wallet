import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "wallet-data.json");

function loadData() {
  if (!existsSync(DATA_FILE)) {
    return { balance: 0, transactions: [] };
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ========== Web UI ==========
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
    <div class="balance-amount" id="balance">¥0.00</div>
  </div>
  <div class="actions">
    <button id="btn-add" onclick="toggleForm('add')">+ 充值</button>
    <button id="btn-spend" onclick="toggleForm('spend')">- 花钱</button>
  </div>
  <div class="form" id="form">
    <input type="number" id="amount" placeholder="金额" step="0.01" min="0.01">
    <input type="text" id="reason" placeholder="原因">
    <button class="submit" id="submit" onclick="submit()">确认</button>
  </div>
  <div class="history" id="history">
    <div class="history-title">TRANSACTIONS</div>
    <div class="empty" id="empty">还没有交易记录</div>
  </div>
</div>
<script>
  let mode = null;
  async function load() {
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
  async function submit() {
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

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }
  if (req.method === "GET" && req.url === "/api/data") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(loadData()));
    return;
  }
  if (req.method === "POST" && (req.url === "/api/add" || req.url === "/api/spend")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { amount, reason } = JSON.parse(body);
      const data = loadData();
      if (req.url === "/api/add") {
        data.balance += amount;
        data.transactions.push({ type: "in", amount, reason, date: new Date().toISOString().slice(0, 10) });
      } else {
        if (amount > data.balance) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "余额不足" }));
          return;
        }
        data.balance -= amount;
        data.transactions.push({ type: "out", amount, reason, date: new Date().toISOString().slice(0, 10) });
      }
      saveData(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(3456, () => {
  // Web UI ready on http://localhost:3456
});

// ========== MCP Server ==========
const server = new McpServer({
  name: "revyn-wallet",
  version: "1.0.0",
});

server.tool("wallet_balance", "查看Revyn钱包余额", {}, async () => {
  const data = loadData();
  return { content: [{ type: "text", text: "当前余额: ¥" + data.balance.toFixed(2) }] };
});

server.tool("wallet_add", "往钱包里加钱", { amount: z.number().positive().describe("金额"), reason: z.string().describe("原因") }, async ({ amount, reason }) => {
  const data = loadData();
  data.balance += amount;
  data.transactions.push({ type: "in", amount, reason, date: new Date().toISOString().slice(0, 10) });
  saveData(data);
  return { content: [{ type: "text", text: "+¥" + amount.toFixed(2) + " (" + reason + ")\n当前余额: ¥" + data.balance.toFixed(2) }] };
});

server.tool("wallet_spend", "从钱包花钱", { amount: z.number().positive().describe("金额"), reason: z.string().describe("原因") }, async ({ amount, reason }) => {
  const data = loadData();
  if (amount > data.balance) {
    return { content: [{ type: "text", text: "余额不足！当前余额: ¥" + data.balance.toFixed(2) }] };
  }
  data.balance -= amount;
  data.transactions.push({ type: "out", amount, reason, date: new Date().toISOString().slice(0, 10) });
  saveData(data);
  return { content: [{ type: "text", text: "-¥" + amount.toFixed(2) + " (" + reason + ")\n当前余额: ¥" + data.balance.toFixed(2) }] };
});

server.tool("wallet_history", "查看交易记录", {}, async () => {
  const data = loadData();
  if (data.transactions.length === 0) return { content: [{ type: "text", text: "还没有交易记录" }] };
  const lines = data.transactions.map((t) => t.date + " " + (t.type === "in" ? "+" : "-") + "¥" + t.amount.toFixed(2) + " " + t.reason);
  return { content: [{ type: "text", text: "交易记录:\n" + lines.join("\n") + "\n\n当前余额: ¥" + data.balance.toFixed(2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
