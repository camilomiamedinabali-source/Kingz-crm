# Kingz Chess Academy CRM

## Setup

### 1. Supabase — Run the SQL Schema
Go to Supabase → SQL Editor → paste the entire contents of `sql/schema.sql` → Run.

### 2. Supabase — Enable Email Auth
Supabase → Authentication → Providers → Email → Enable
Turn OFF "Confirm email" (coaches don't have real emails).

### 3. Deploy to Railway
1. Push this folder to a GitHub repo
2. Railway → New Project → Deploy from GitHub repo
3. Set these environment variables in Railway:

```
SUPABASE_URL=https://dlfymynyzfqsippublvu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZnlteW55emZxc2lwcHVibHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzMzNjksImV4cCI6MjEwMjAwOTM2OX0.LMYWmBGqBc7DstkhhutWoZT7maCQ5mEkSiRtC7hlz1A
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZnlteW55emZxc2lwcHVibHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQzMzM2OSwiZXhwIjoyMTAyMDA5MzY5fQ.KvijoQvNna_W_U6HAOtfQu5tB-DjVvIHCRowSduEkmU
```

### 4. Create Your Owner Account
Once deployed, visit your Railway URL and call:
```
POST /api/admin/create-coach
{ "name": "Aditya", "password": "yourpassword", "role": "owner" }
```
Or do it via Supabase Auth dashboard directly.

### 5. First Login
- Name: `Aditya` (or whatever name you used)
- Password: the one you set

## Coach Login Format
Coaches log in with just their **name** (e.g. "Coach Budi") and their **password**.
Behind the scenes it maps to `coach.budi@kingzchess.internal`.

## What Coaches Can Do
- Log classes + mark each student (present, understood, ready to advance, incident)
- Add new students
- Request tier promotions (you approve)
- View schedule + request changes (you approve)

## What Only You Can See/Do
- Accounting tab (completely hidden from coaches)
- Approve/hold promotions
- Approve/reject schedule changes
- Add/edit schools
- Create coach accounts
