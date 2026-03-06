require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Serve Frontend ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── POST /api/alarm  ─────────────────────────────────────────────────────────
// Sends a Pushover notification with configurable priority & sound
app.post('/api/alarm', async (req, res) => {
  const {
    title    = '🚨 Alarm Triggered!',
    message  = 'Button was pressed on the website.',
    sound    = 'siren',
    priority = 2,        // 2 = Emergency (repeats until acknowledged)
    retry    = 60,       // seconds between retries (required if priority=2)
    expire   = 3600,     // seconds before giving up (required if priority=2)
  } = req.body;

  const appToken = process.env.PUSHOVER_APP_TOKEN;
  const userKey  = process.env.PUSHOVER_USER_KEY;

  if (!appToken || !userKey) {
    return res.status(500).json({
      success: false,
      error:
        'PUSHOVER_APP_TOKEN or PUSHOVER_USER_KEY is missing. ' +
        'Run "node setup.js" to configure your credentials.',
    });
  }

  try {
    const payload = {
      token:   appToken,
      user:    userKey,
      title,
      message,
      sound,
      priority: Number(priority),
    };

    // Emergency priority (2) requires retry + expire (Pushover minimum retry is 30 sec)
    if (Number(priority) === 2) {
      payload.retry  = Math.max(Number(retry) || 30, 30);
      payload.expire = Number(expire);
    }

    const response = await axios.post(
      'https://api.pushover.net/1/messages.json',
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const receipt = response.data.receipt || null;

    console.log(`✅ Alarm sent! Sound: ${sound} | Priority: ${priority} | Receipt: ${receipt}`);

    return res.json({
      success: true,
      message: 'Alarm sent to your phone!',
      receipt,          // only present for emergency priority — used to cancel
      priority: Number(priority),
    });
  } catch (err) {
    const errMsg = err.response?.data?.errors?.join(', ') || err.message;
    console.error('❌ Pushover error:', errMsg);
    return res.status(500).json({ success: false, error: errMsg });
  }
});

// ─── POST /api/cancel  ────────────────────────────────────────────────────────
// Cancel a repeating emergency alarm using its receipt token
app.post('/api/cancel', async (req, res) => {
  const { receipt } = req.body;
  const appToken    = process.env.PUSHOVER_APP_TOKEN;

  if (!receipt) {
    return res.status(400).json({ success: false, error: 'No receipt token provided.' });
  }

  try {
    await axios.post(
      `https://api.pushover.net/1/receipts/${receipt}/cancel.json`,
      { token: appToken },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`🔕 Emergency alarm cancelled. Receipt: ${receipt}`);
    return res.json({ success: true, message: 'Emergency alarm cancelled!' });
  } catch (err) {
    const errMsg = err.response?.data?.errors?.join(', ') || err.message;
    console.error('❌ Cancel error:', errMsg);
    return res.status(500).json({ success: false, error: errMsg });
  }
});

// ─── GET /api/status  ─────────────────────────────────────────────────────────
// Check if credentials are configured
app.get('/api/status', (req, res) => {
  const configured =
    !!process.env.PUSHOVER_APP_TOKEN && !!process.env.PUSHOVER_USER_KEY;
  res.json({ configured });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🚨 Pushover Alarm Server is running!');
  console.log(`   Open: http://localhost:${PORT}`);
  console.log('');
  const configured =
    !!process.env.PUSHOVER_APP_TOKEN && !!process.env.PUSHOVER_USER_KEY;
  if (!configured) {
    console.log('⚠️  Credentials not set! Run: node setup.js');
  } else {
    console.log('✅  Pushover credentials loaded.');
  }
  console.log('');
});
