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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config endpoint: send only the anon key + URL to the browser ──
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

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

// Catch-all: serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kingz CRM running on port ${PORT}`);
});
