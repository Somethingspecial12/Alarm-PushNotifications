// ─── State ────────────────────────────────────────────────────────────────────
let selectedSound    = 'siren';
let activeReceipt    = null;   // receipt token from emergency alarms (used to cancel)

// ─── On Page Load ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Check if server credentials are configured
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (!data.configured) {
      document.getElementById('credWarn').style.display = 'block';
    }
  } catch (e) {
    // server might not be running yet
  }

  // Show/hide emergency settings based on selected priority
  document.querySelectorAll('input[name="priority"]').forEach((radio) => {
    radio.addEventListener('change', toggleEmergencySettings);
  });
  toggleEmergencySettings();

  // Bind buttons explicitly so they work even if inline handlers fail
  const emergencyBtn = document.getElementById('emergencyBtn');
  const sendBtn = document.getElementById('sendBtn');
  if (emergencyBtn) emergencyBtn.addEventListener('click', (e) => { e.preventDefault(); triggerEmergency(); });
  if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendCustomAlarm(); });
});

// ─── Toast System ─────────────────────────────────────────────────────────────
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'default', duration = 4500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '&#9989;', error: '&#10060;', default: '&#128276;' };
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function setStatus(text, state = 'ready') {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  span.textContent = text;
  dot.className = 'status-dot';
  if (state === 'loading') dot.classList.add('loading');
  if (state === 'error')   dot.classList.add('error');
  if (state === 'sent')    dot.classList.add('sent');
}

// ─── Sound Selector ───────────────────────────────────────────────────────────
function selectSound(btn) {
  document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSound = btn.dataset.sound;
}

// ─── Emergency Settings Toggle ────────────────────────────────────────────────
function toggleEmergencySettings() {
  const priority = document.querySelector('input[name="priority"]:checked')?.value;
  const el = document.getElementById('emergencySettings');
  el.style.display = priority === '2' ? 'block' : 'none';
}

// ─── TRIGGER EMERGENCY (one-click big red button) ─────────────────────────────
async function triggerEmergency() {
  await doSendAlarm({
    title:    'EMERGENCY ALARM',
    message:  'Emergency alarm triggered from the website!',
    sound:    'siren',
    priority: 2,
    retry:    30,
    expire:   3600,
    isEmergency: true,
  });
}

// ─── SEND CUSTOM ALARM (form) ─────────────────────────────────────────────────
async function sendCustomAlarm() {
  const title    = document.getElementById('alarmTitle').value.trim()   || 'Alarm';
  const message  = document.getElementById('alarmMessage').value.trim() || 'Alarm triggered!';
  const priority = Number(document.querySelector('input[name="priority"]:checked')?.value ?? 2);
  const retryRaw = Number(document.getElementById('retryEvery').value)  || 30;
  const retry    = Math.min(30, Math.max(1, retryRaw));  // allow 1–30 sec in UI
  const expire   = Number(document.getElementById('expireAfter').value) || 3600;

  await doSendAlarm({
    title, message,
    sound:    selectedSound,
    priority, retry, expire,
    isEmergency: priority === 2,
  });
}

// ─── QUICK PRESETS ────────────────────────────────────────────────────────────
const PRESETS = {
  fire:     { title: 'FIRE ALERT!',       message: 'Fire alarm has been triggered. Evacuate immediately!', sound: 'siren',    priority: 2, retry: 30, expire: 3600 },
  intruder: { title: 'INTRUDER ALERT!',   message: 'Motion detected. Possible intruder on premises.',     sound: 'alien',    priority: 2, retry: 30, expire: 3600 },
  server:   { title: 'SERVER DOWN!',      message: 'Critical: Server is not responding. Immediate action required!', sound: 'mechanical', priority: 2, retry: 60, expire: 3600 },
  reminder: { title: 'Reminder',          message: 'You have a scheduled reminder from the website.',     sound: 'bike',     priority: 1, retry: 30, expire: 600 },
};

async function sendPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  await doSendAlarm({ ...preset, isEmergency: preset.priority === 2 });
}

// ─── CANCEL EMERGENCY ALARM ───────────────────────────────────────────────────
async function cancelAlarm() {
  if (!activeReceipt) {
    showToast('No active emergency alarm to cancel.', 'error');
    return;
  }

  const cancelBtn = document.getElementById('cancelBtn');
  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling...';

  try {
    const res  = await fetch('/api/cancel', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receipt: activeReceipt }),
    });
    const data = await res.json();

    if (data.success) {
      showToast('Alarm cancelled successfully!', 'success');
      setStatus('Alarm cancelled', 'sent');
      hideCancelBar();
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    showToast('Failed to cancel: ' + err.message, 'error');
  } finally {
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel Alarm';
    setTimeout(() => setStatus('Ready to trigger alarm', 'ready'), 3000);
  }
}

// ─── CORE SEND FUNCTION ───────────────────────────────────────────────────────
async function doSendAlarm({ title, message, sound, priority, retry, expire, isEmergency }) {
  // Determine which button to lock
  const isEmergencyBtn = isEmergency && title === 'EMERGENCY ALARM';
  const btn     = document.getElementById(isEmergencyBtn ? 'emergencyBtn' : 'sendBtn');
  const loader  = document.getElementById(isEmergencyBtn ? 'emergencyLoader' : 'sendLoader');
  const btnText = document.getElementById(isEmergencyBtn ? 'emergencyBtnText' : 'sendBtnText');

  btn.disabled         = true;
  loader.classList.add('visible');
  btnText.textContent  = 'Sending alarm...';
  setStatus('Sending alarm to phone...', 'loading');

  try {
    const res  = await fetch('/api/alarm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, message, sound, priority, retry, expire }),
    });
    const data = await res.json();

    if (data.success) {
      showToast('Alarm sent to your phone! Check Pushover.', 'success');
      setStatus(isEmergency ? 'Emergency alarm active — repeating!' : 'Alarm sent!', 'sent');

      // Store receipt for emergency alarms so we can cancel them
      if (isEmergency && data.receipt) {
        activeReceipt = data.receipt;
        showCancelBar();
      }

      addToLog(title, message, sound, priority, true);
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    const msg = err.message === 'Failed to fetch' || err.name === 'TypeError'
      ? 'Cannot reach server. Start it with "npm start" and open http://localhost:' + (window.location.port || '3000')
      : err.message;
    showToast('Failed to send alarm: ' + msg, 'error', 6000);
    setStatus('Failed to send alarm', 'error');
    addToLog(title, message, sound, priority, false);
    console.error('Alarm error:', err);
  } finally {
    btn.disabled        = false;
    loader.classList.remove('visible');
    btnText.textContent = isEmergencyBtn ? 'TRIGGER EMERGENCY ALARM' : 'Send Alarm to Phone';
    setTimeout(() => {
      if (!activeReceipt) setStatus('Ready to trigger alarm', 'ready');
    }, 3000);
  }
}

// ─── Cancel Bar Helpers ───────────────────────────────────────────────────────
function showCancelBar() {
  document.getElementById('cancelBar').style.display = 'flex';
}
function hideCancelBar() {
  document.getElementById('cancelBar').style.display = 'none';
  activeReceipt = null;
}

// ─── Alarm Log ────────────────────────────────────────────────────────────────
const PRIORITY_LABELS = { '-2': 'Lowest', '-1': 'Low', '0': 'Normal', '1': 'High', '2': 'Emergency' };

function addToLog(title, message, sound, priority, success) {
  const logCard = document.getElementById('logCard');
  const logList = document.getElementById('alarmLog');
  logCard.style.display = 'block';

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const pLabel = PRIORITY_LABELS[String(priority)] || 'Unknown';

  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-icon">${success ? '&#128680;' : '&#10060;'}</span>
    <div class="log-body">
      <div class="log-title">${escHtml(title)}</div>
      <div class="log-msg">${escHtml(message)}</div>
      <div class="log-meta">
        <span class="log-time">${time}</span>
        <span class="log-sound">${escHtml(sound)}</span>
        <span class="log-sound">${pLabel}</span>
      </div>
    </div>
    <span class="log-badge ${success ? 'ok' : 'err'}">${success ? 'Sent' : 'Failed'}</span>
  `;
  logList.prepend(item);
}

function clearLog() {
  document.getElementById('alarmLog').innerHTML = '';
  document.getElementById('logCard').style.display = 'none';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
