const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Admin client (service role — server side only, never sent to browser)
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active remote sessions in memory (session_id -> {created_at, last_activity})
const remoteSessions = new Map();

// ── Config endpoint: send only the anon key + URL to the browser ──
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// ── Remote Control: Create a pairing session with QR code ──
app.post('/api/remote/create-session', async (req, res) => {
  try {
    const sessionId = uuidv4();
    remoteSessions.set(sessionId, {
      created_at: Date.now(),
      last_activity: Date.now()
    });

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(`${req.protocol}://${req.get('host')}/remote/${sessionId}`, {
      width: 300,
      margin: 2,
      color: { dark: '#1c0d0d', light: '#f4ead6' }
    });

    res.json({
      success: true,
      sessionId,
      qrCode: qrCodeUrl,
      paringUrl: `/remote/${sessionId}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Remote Control: Send message from phone to desktop ──
app.post('/api/remote/send-message', async (req, res) => {
  const { sessionId, message, type = 'text' } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message required' });
  }

  if (!remoteSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Update session activity
  const session = remoteSessions.get(sessionId);
  session.last_activity = Date.now();

  try {
    // Store message in session for polling
    session.lastMessage = {
      id: uuidv4(),
      message,
      type,
      timestamp: new Date().toISOString(),
      from: 'phone'
    };

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Remote Control: Get new messages (for polling) ──
app.get('/api/remote/messages/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = remoteSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const message = session.lastMessage;
  session.lastMessage = null; // Clear after reading

  res.json({ message });
});

// ── Remote Control: Send response from desktop to phone ──
app.post('/api/remote/send-response', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message required' });
  }

  if (!remoteSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = remoteSessions.get(sessionId);
  session.last_activity = Date.now();

  try {
    // Store response in session
    session.lastResponse = {
      id: uuidv4(),
      message,
      timestamp: new Date().toISOString(),
      from: 'desktop'
    };

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Remote Control: Get new responses (for polling) ──
app.get('/api/remote/responses/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = remoteSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const response = session.lastResponse;
  session.lastResponse = null; // Clear after reading

  res.json({ response });
});

// ── Remote Control: Cleanup old sessions ──
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of remoteSessions.entries()) {
    if (now - session.last_activity > timeout) {
      remoteSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// ── Admin: create coach account (owner only via service role) ──
app.post('/api/admin/create-coach', async (req, res) => {
  const { name, password, role = 'coach' } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });

  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@kingzchess.internal`;

  try {
    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) return res.status(400).json({ error: authError.message });

    // Insert into coaches table
    const { error: dbError } = await adminClient
      .from('coaches')
      .insert({ name, email, role });
    if (dbError) return res.status(400).json({ error: dbError.message });

    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: update coach password ──
app.post('/api/admin/update-coach-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const user = users.users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'Coach not found' });

    const { error } = await adminClient.auth.admin.updateUserById(user.id, { password });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: deactivate coach ──
app.post('/api/admin/deactivate-coach', async (req, res) => {
  const { email } = req.body;
  try {
    await adminClient.from('coaches').update({ active: false }).eq('email', email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Remote Control: Serve remote control interface ──
app.get('/remote/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'remote.html'));
});

// Catch-all: serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kingz CRM running on port ${PORT}`);
});
