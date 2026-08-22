# Kingz CRM - Complete Backup Configuration
Generated: $(date)

## Environment Variables Required for Railway
```
SUPABASE_URL=https://dlfymynyzfqsippublvu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZnlteW55emZxc2lwcHVibHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzMzNjksImV4cCI6MjEwMjAwOTM2OX0.LMYWmBGqBc7DstkhhutWoZT7maCQ5mEkSiRtC7hlz1A
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZnlteW55emZxc2lwcHVibHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQzMzM2OSwiZXhwIjoyMTAyMDA5MzY5fQ.KvijoQvNna_W_U6HAOtfQu5tB-DjVvIHCRowSduEkmU
DATABASE_URL=postgresql://postgres.dlfymynyzfqsippublvu:Q5hWotWTTsMYsWlz@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
PORT=3000
```

## Current Deployment Status
- Vercel: ✅ Deployed (Preview Ready)
- Railway: Pending (Free tier limit)
- GitHub: ✅ Pushed to claude/supabase-rls-warnings-qab5ca

## Schema Files
- schema.sql: Complete RLS policies for all tables
- server.js: Direct PostgreSQL integration for data, Supabase for auth

## Coaches Setup (from admin-setup page)
```json
[
  {"name": "Camilo", "passcode": "kingz162773"},
  {"name": "TAMA", "passcode": "kingz922101"},
  {"name": "KADEK", "passcode": "kingz602424"},
  {"name": "SHIDIQ", "passcode": "kingz802076"},
  {"name": "Brian", "passcode": "kingz974236"}
]
```

## Recent Changes
1. Fixed RLS warnings - added complete DELETE policies
2. Direct PostgreSQL integration for all data operations
3. Supabase kept for authentication only
4. Vercel preview deployment ready

## To Restore
1. Set environment variables above
2. Run schema.sql in Supabase SQL Editor
3. Create coaches using /admin-setup endpoint
4. Deploy to Railway/Vercel with DATABASE_URL
