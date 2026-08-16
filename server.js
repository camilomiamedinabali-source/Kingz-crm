const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Optionally create admin client if Supabase credentials are provided
let adminClient = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── Shared CRM state, backed by the project's own Postgres instance ──
const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
let pgPool = null;
if (DATABASE_URL) {
  pgPool = new Pool({ connectionString: DATABASE_URL });
  pgPool.query(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, blob JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    .then(() => console.log('[DB] kv table ready'))
    .catch(err => console.error('[DB] Failed to initialize kv table:', err.message));
} else {
  console.warn('[DB] DATABASE_URL not set — shared state disabled');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Shared state: whole-app blob, single row keyed "main" ──
app.get('/api/state', async (req, res) => {
  if (!pgPool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { rows } = await pgPool.query('SELECT blob FROM kv WHERE key = $1', ['main']);
    res.json({ blob: rows[0] ? rows[0].blob : null });
  } catch (err) {
    console.error('[State] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/state', async (req, res) => {
  if (!pgPool) return res.status(503).json({ error: 'Database not configured' });
  const { blob } = req.body;
  if (!blob) return res.status(400).json({ error: 'blob required' });
  try {
    await pgPool.query(
      `INSERT INTO kv (key, blob, updated_at) VALUES ('main', $1, now())
       ON CONFLICT (key) DO UPDATE SET blob = $2, updated_at = now()`,
      [blob, blob]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[State] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin setup page for creating coaches ──
app.get('/admin-setup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Coach Setup</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 40px auto; padding: 20px; }
        textarea { width: 100%; height: 300px; font-family: monospace; }
        button { padding: 10px 20px; font-size: 16px; }
        .result { margin-top: 20px; padding: 10px; background: #f0f0f0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>Coach Setup</h1>
      <p>Paste the coaches JSON below:</p>
      <textarea id="input">[
  {"name": "Camilo", "passcode": "kingz162773"},
  {"name": "TAMA", "passcode": "kingz922101"},
  {"name": "KADEK", "passcode": "kingz602424"},
  {"name": "SHIDIQ", "passcode": "kingz802076"},
  {"name": "Brian", "passcode": "kingz974236"}
]</textarea>
      <br><br>
      <button onclick="setup()">Create All Coaches</button>
      <div id="result"></div>
      <script>
        async function setup() {
          try {
            const coaches = JSON.parse(document.getElementById('input').value);
            const res = await fetch('/api/admin/create-coaches-with-passcodes', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({coaches})
            });
            const data = await res.json();
            let html = '<div class="result"><h3>✓ Setup Complete!</h3><pre>' + JSON.stringify(data.results, null, 2) + '</pre></div>';
            document.getElementById('result').innerHTML = html;
          } catch(e) {
            document.getElementById('result').innerHTML = '<div class="result"><h3>✗ Error: ' + e.message + '</h3></div>';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ── Config endpoint: send only the anon key + URL to the browser ──
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// ── Diagnostic: show what service key is configured ──
app.get('/api/admin/check-key', (req, res) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  res.json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyStart: key ? key.substring(0, 30) : 'NOT SET',
    keyFormat: key && key.startsWith('eyJ') ? '✓ Correct JWT format' : '✗ Wrong format (should start with eyJ)',
    message: key ? 'Check if keyStart matches your Supabase service_role secret' : 'SUPABASE_SERVICE_KEY not set in environment'
  });
});

// ── Diagnostic: show which coaches exist in Supabase ──
app.get('/api/admin/check-coaches', async (req, res) => {
  if (!adminClient) return res.status(500).json({ error: 'Server not configured' });

  try {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const { data: coaches, error: coachError } = await adminClient.from('coaches').select('*');

    res.json({
      supabaseUsers: users.users.map(u => ({ email: u.email, id: u.id, created_at: u.created_at })),
      coachesInDB: coaches || [],
      coachError: coachError ? coachError.message : null,
      message: users.users.length === 0 ? '⚠️ No coaches in Supabase Auth - they were never created' : `✓ Found ${users.users.length} coaches`
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// ── Admin: create coach account (owner only via service role) ──
app.post('/api/admin/create-coach', async (req, res) => {
  const { name, password, role = 'coach' } = req.body;
  console.log('[Create Coach] Request for name:', name);
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  if (!adminClient) {
    console.error('[Create Coach] ERROR: adminClient not initialized');
    return res.status(500).json({ error: 'Server is not configured with SUPABASE_SERVICE_KEY' });
  }

  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@kingzchess.internal`;
  console.log('[Create Coach] Generated email:', email);

  try {
    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) {
      console.error('[Create Coach] Auth error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // Insert into coaches table
    const { error: dbError } = await adminClient
      .from('coaches')
      .insert({ name, email, role });
    if (dbError) {
      console.error('[Create Coach] DB error:', dbError.message);
      return res.status(400).json({ error: dbError.message });
    }

    console.log('[Create Coach] Success for:', email);
    res.json({ success: true, email });
  } catch (err) {
    console.error('[Create Coach] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: update coach password ──
app.post('/api/admin/update-coach-password', async (req, res) => {
  const { email, password } = req.body;
  console.log('[Password Update] Request for email:', email);
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!adminClient) {
    console.error('[Password Update] ERROR: adminClient not initialized');
    return res.status(500).json({ error: 'Server is not configured with SUPABASE_SERVICE_KEY' });
  }

  try {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const user = users.users.find(u => u.email === email);
    if (!user) {
      console.error('[Password Update] Coach not found:', email);
      return res.status(404).json({ error: 'Coach not found' });
    }

    const { error } = await adminClient.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.error('[Password Update] Update error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log('[Password Update] Success for:', email);
    res.json({ success: true });
  } catch (err) {
    console.error('[Password Update] Exception:', err.message);
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

// ── Admin: bulk create coach logins with auto-generated passcodes ──
app.post('/api/admin/bulk-create-coaches', async (req, res) => {
  const { coaches } = req.body; // Array of {id, name}
  if (!coaches || !Array.isArray(coaches)) return res.status(400).json({ error: 'coaches array required' });
  if (!adminClient) return res.status(500).json({ error: 'Server is not configured with SUPABASE_SERVICE_KEY' });

  const results = [];

  for (const coach of coaches) {
    const { id, name } = coach;
    if (!name) continue;

    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@kingzchess.internal`;
    const password = `kingz${Math.random().toString().slice(2, 8)}`; // e.g., kingz123456

    try {
      // Check if user already exists
      const { data: users } = await adminClient.auth.admin.listUsers();
      const exists = users.users.some(u => u.email === email);

      if (!exists) {
        // Create auth user
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });
        if (authError) throw new Error(authError.message);
        console.log('[Bulk Create] Created:', email);
      } else {
        console.log('[Bulk Create] Already exists:', email);
      }

      results.push({ id, name, email, password: exists ? '(already set)' : password });
    } catch (err) {
      results.push({ id, name, email, error: err.message });
    }
  }

  res.json({ success: true, results });
});

// ── Admin: create coaches with specific passcodes ──
app.post('/api/admin/create-coaches-with-passcodes', async (req, res) => {
  const { coaches } = req.body; // Array of {name, passcode}
  if (!coaches || !Array.isArray(coaches)) return res.status(400).json({ error: 'coaches array required' });
  if (!adminClient) return res.status(500).json({ error: 'Server is not configured with SUPABASE_SERVICE_KEY' });

  const results = [];

  for (const coach of coaches) {
    const { name, passcode } = coach;
    if (!name || !passcode) continue;

    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@kingzchess.internal`;

    try {
      // Check if user already exists
      const { data: users } = await adminClient.auth.admin.listUsers();
      const existing = users.users.find(u => u.email === email);

      if (existing) {
        // Update password
        const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, { password: passcode });
        if (updateError) throw new Error(updateError.message);
        results.push({ name, email, passcode, status: 'password_updated' });
        console.log('[Create with Passcode] Updated:', email);
      } else {
        // Create new user
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password: passcode,
          email_confirm: true
        });
        if (authError) throw new Error(authError.message);

        // Insert into coaches table
        const { error: dbError } = await adminClient
          .from('coaches')
          .insert({ name, email, role: 'coach' });
        if (dbError && !dbError.message.includes('violates')) throw new Error(dbError.message);

        results.push({ name, email, passcode, status: 'created' });
        console.log('[Create with Passcode] Created:', email);
      }
    } catch (err) {
      results.push({ name, email, error: err.message, status: 'failed' });
      console.error('[Create with Passcode] Error for', name, ':', err.message);
    }
  }

  res.json({ success: true, results });
});

// Catch-all: serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kingz CRM running on port ${PORT}`);
});
