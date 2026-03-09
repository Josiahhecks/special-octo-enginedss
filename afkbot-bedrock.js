const bedrock = require('bedrock-protocol');
const express = require('express');
const readline = require('readline');

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  host: process.env.MC_HOST || '191.96.231.9',
  port: parseInt(process.env.MC_PORT) || 30228,
  username: process.env.MC_USERNAME || 'AFKBOT',
  version: process.env.MC_VERSION || '1.26.2',
  webPort: parseInt(process.env.PORT) || 3000, // Railway sets PORT automatically
};
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth state shared between web server & bot ────────────────────────────────
let authState = {
  status: 'waiting',   // waiting | pending | authed | error
  userCode: null,
  verificationUrl: null,
  message: 'Waiting to start authentication...',
};

// ── Express web server ────────────────────────────────────────────────────────
const app = express();

app.get('/', (req, res) => {
  const statusColor = {
    waiting: '#f59e0b',
    pending: '#3b82f6',
    authed:  '#22c55e',
    error:   '#ef4444',
  }[authState.status] ?? '#888';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AFKBOT - Microsoft Auth</title>
  <meta http-equiv="refresh" content="5"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo { font-size: 3rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }
    .status-badge {
      display: inline-block;
      background: ${statusColor}22;
      color: ${statusColor};
      border: 1px solid ${statusColor}55;
      border-radius: 999px;
      padding: 0.3rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1.5rem;
    }
    .code-box {
      background: #0f172a;
      border: 2px solid #3b82f6;
      border-radius: 12px;
      padding: 1.25rem;
      margin: 1.5rem 0;
    }
    .code-label { color: #64748b; font-size: 0.8rem; margin-bottom: 0.5rem; }
    .code {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: 0.25em;
      color: #60a5fa;
      font-family: monospace;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: white;
      text-decoration: none;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      margin-top: 0.5rem;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
    .message { color: #94a3b8; font-size: 0.9rem; margin-top: 1.5rem; }
    .refresh-note { color: #475569; font-size: 0.75rem; margin-top: 1rem; }
    .success-icon { font-size: 4rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🤖</div>
    <h1>AFKBOT</h1>
    <p class="subtitle">Minecraft Bedrock Edition</p>

    <div class="status-badge">${authState.status}</div>

    ${authState.status === 'pending' ? `
      <p style="color:#94a3b8; margin-bottom:0.5rem;">Sign in with Microsoft to authenticate the bot:</p>
      <div class="code-box">
        <div class="code-label">ENTER THIS CODE AT microsoft.com/devicelogin</div>
        <div class="code">${authState.userCode}</div>
      </div>
      <a class="btn" href="${authState.verificationUrl}" target="_blank">
        Open Microsoft Login
      </a>
    ` : ''}

    ${authState.status === 'authed' ? `
      <div class="success-icon">✅</div>
      <p style="color:#22c55e; font-weight:600; font-size:1.1rem;">Bot is authenticated and connected!</p>
    ` : ''}

    ${authState.status === 'error' ? `
      <p style="color:#ef4444;">Error: ${authState.message}</p>
    ` : ''}

    ${authState.status === 'waiting' ? `
      <p style="color:#94a3b8;">Bot is starting up, please wait...</p>
    ` : ''}

    <p class="message">${authState.message}</p>
    <p class="refresh-note">Page auto-refreshes every 5 seconds</p>
  </div>
</body>
</html>`);
});

// Railway health check
app.get('/health', (req, res) => res.json({ status: authState.status, ok: authState.status === 'authed' }));

app.listen(CONFIG.webPort, () => {
  console.log(`Web auth page running at http://localhost:${CONFIG.webPort}`);
  console.log(`On Wispbyte, expose port ${CONFIG.webPort} to access it externally.`);
});

// ── Bot ───────────────────────────────────────────────────────────────────────
let currentClient = null;
let reconnectTimer = null;

function createBot() {
  console.log('Connecting to Bedrock server...');

  const client = bedrock.createClient({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    offline: false,
    authTitle: bedrock.title.MinecraftNintendoSwitch,
    flow: 'sisu',

    onMsaCode(data) {
      authState = {
        status: 'pending',
        userCode: data.user_code,
        verificationUrl: data.verification_uri,
        message: `Visit ${data.verification_uri} and enter code: ${data.user_code}`,
      };
      console.log('\nMicrosoft Auth Required!');
      console.log(`  Visit: ${data.verification_uri}`);
      console.log(`  Code:  ${data.user_code}`);
      console.log('  Or open the web UI to click the link.\n');
    },
  });

  currentClient = client;

  client.on('spawn', () => {
    authState = {
      status: 'authed',
      userCode: null,
      verificationUrl: null,
      message: 'Bot has joined the server successfully.',
    };
    console.log('AFKBOT has spawned in the world!');
  });

  client.on('text', (packet) => {
    const msg = packet.message ?? packet.parameters?.[0] ?? '';
    if (msg) console.log('[Server]', msg);
  });

  client.on('kick', (reason) => {
    console.warn('[Kicked]', JSON.stringify(reason));
    authState.message = 'Bot was kicked. Reconnecting...';
    scheduleReconnect();
  });

  client.on('error', (err) => {
    console.error('[Error]', err.message ?? err);
    authState = { ...authState, status: 'error', message: err.message ?? String(err) };
  });

  client.on('close', () => {
    console.log('Connection closed. Reconnecting in 5s...');
    authState.message = 'Disconnected. Reconnecting in 5 seconds...';
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, 5000);
}

// Console chat input (local only, Railway has no TTY)
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line) => {
    if (!currentClient) {
      console.log('Bot not connected yet.');
      return;
    }
    currentClient.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: CONFIG.username,
      xuid: '',
      platform_chat_id: '',
      message: line.trim(),
    });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
createBot();
