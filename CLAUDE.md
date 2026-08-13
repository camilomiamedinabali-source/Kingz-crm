# Kingz Chess Academy CRM — Codebase Guide

## Project Overview

**Kingz Chess Academy CRM** is a specialized student management system designed for chess coaching operations. It enables coaches to log classes, track student progress, manage promotions through skill tiers, and maintain scheduling. The owner/admin gets visibility into accounting, approvals for promotions and schedule changes, and coach management.

- **Owner URL**: Railway deployment at environment-provided URL
- **Tech Stack**: Express.js backend + Single Page Application (SPA) frontend + Supabase backend-as-a-service
- **Node Version**: ≥ 18.0.0
- **Main Entry**: `server.js` (Express) serves `/public/index.html` (SPA)

---

## Architecture

### System Design
```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Coach or Owner)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ public/index.html (Single Page Application)          │   │
│  │ • Vue-like or vanilla JS DOM manipulation            │   │
│  │ • Fetch API + supabase-js client library             │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓ HTTP/REST
    ┌──────────────────────────────────┐
    │  Express.js (server.js)          │
    │  • GET /api/config (keys)        │
    │  • POST /api/admin/* (admin ops) │
    │  • GET /* → serve SPA            │
    └──────────────────┬───────────────┘
                       │
          ┌────────────┴────────────┐
          ↓                         ↓
    [Admin API]          [Supabase Client (RLS)]
    (Service Role)        (Row-Level Security)
    • User mgmt          • Coaches, schools,
    • Schema ops         • Students, class logs
                         • Promotions, schedules
                         • Accounting (owner only)
```

### Key Points
- **Frontend**: Vanilla JS (no framework build step); fetches config from `/api/config` to get Supabase URL + anon key
- **Backend**: Express middleware sends static files and serves a config endpoint
- **Auth**: Supabase email-based auth (no email confirmation for coaches)
- **Permissions**: Row-Level Security (RLS) policies enforce role-based access at the database level

---

## Tech Stack & Dependencies

```json
{
  "express": "^4.18.2",
  "@supabase/supabase-js": "^2.39.0",
  "node": ">=18.0.0"
}
```

### External Services
- **Supabase** (PostgreSQL + Auth + RLS)
- **Railway** (deployment platform)
- **GitHub Actions** (scheduled backups)

---

## Database Schema

All tables use UUIDs as primary keys with `gen_random_uuid()` defaults. Timestamps are `timestamptz` with `now()` defaults.

### Core Tables

#### `coaches` — Staff accounts
```sql
id, name, email (unique), role ('coach'|'owner'), active, created_at
```
- **Role**: `owner` = full system access; `coach` = limited operations
- **Email format**: Internal (`coach.name@kingzchess.internal`) or real for owner

#### `schools` — Partner schools
```sql
id, name, location, coordinator_name, coordinator_contact, renewal_date, notes, active, created_at
```

#### `students` — Student records
```sql
id, name, school_id (nullable), current_tier (1-6), type ('school'|'private'),
parent_name, parent_phone, parent_contact, notes, active, added_by (coach id), created_at
```
- **Tier**: 1-6 skill levels; coaches request promotions, owner approves

#### `class_logs` — Log a class session
```sql
id, coach_id, school_id, class_type ('school'|'private'), class_date, topic, notes, created_at
```
- Coaches create; owner sees all

#### `student_class_entries` — Per-student attendance & progress in a class
```sql
id, class_log_id, student_id, present, understood_topic, behavior ('good'|'needs_attention'|'incident'),
incident_note, note, ready_to_advance, created_at
```

#### `promotion_requests` — Tier advancement requests
```sql
id, student_id, requested_by (coach), from_tier, to_tier, reason, status ('pending'|'approved'|'held'),
reviewed_by, reviewed_at, review_note, created_at
```

#### `schedule_slots` — Class schedule (recurring)
```sql
id, school_id, student_id (nullable), coach_id, day_of_week (0-6), start_time, end_time, notes, active, created_at
```

#### `schedule_change_requests` — Requests to modify schedule
```sql
id, slot_id, requested_by (coach), requested_date, requested_day (0-6), requested_start, requested_end,
reason, status ('pending'|'approved'|'rejected'), reviewed_by, reviewed_at, created_at
```

#### `accounting` — Financial records (owner-only visibility)
```sql
id, student_id (nullable), school_id (nullable), type ('payment'|'invoice'|'expense'),
amount (numeric 10,2), currency (default 'IDR'), description, date, notes, created_at
```

### RLS Policies

**Helper Functions:**
- `get_my_role()` — Return current user's role from coaches table
- `get_my_coach_id()` — Return current user's coach ID

**Permission Model:**
| Table | Coach | Owner |
|-------|-------|-------|
| `coaches` | Read self only | Full CRUD |
| `schools` | Read only | Full CRUD |
| `students` | Create & read | Read & update |
| `class_logs` | Create & read; edit own | Full CRUD |
| `student_class_entries` | Create & read & update | Full CRUD |
| `promotion_requests` | Create & read | Read & update (approve/hold) |
| `schedule_slots` | Read only | Full CRUD |
| `schedule_change_requests` | Create & read | Read & update (approve/reject) |
| `accounting` | No access | Full CRUD |

---

## API Endpoints

### Public
- **GET** `/api/config`
  - Returns `{ supabaseUrl, supabaseAnonKey }`
  - Used by browser to initialize Supabase client

### Admin-Only (Server-Side, Service Role)
- **POST** `/api/admin/create-coach`
  - Body: `{ name, password, role? }`
  - Creates auth user + coaches table entry
  
- **POST** `/api/admin/update-coach-password`
  - Body: `{ email, password }`
  
- **POST** `/api/admin/deactivate-coach`
  - Body: `{ email }`
  - Sets `active = false`

### Frontend Client Ops
All done via `supabase-js` client directly (RLS enforced):
- Insert/update/delete through standard Supabase client methods
- No additional backend endpoints needed; RLS policies gate access

---

## Frontend Architecture

### `public/index.html` — Single Page Application

**Structure:**
- **CSS**: Embedded `<style>` block (~650 lines) with rich design tokens (wood, gold, cream, etc.)
- **HTML**: Semantic markup with navigation tabs and view sections
- **JS**: Inline script that:
  1. Fetches `/api/config` to get Supabase credentials
  2. Initializes `@supabase/supabase-js` client
  3. Authenticates user via email (internal coaches) or owner login
  4. Routes between views (tabs: Logs, Students, Promotions, Schedule, Accounting, Coaches)
  5. Manages form submissions, data fetches, and RLS-compliant queries

**Design Tokens:**
```css
--wood: #2a1414;           /* Dark wood background */
--gold: #c9a24b;           /* Primary accent */
--cream: #f4ead6;          /* Main text color */
--good: #3f7d4e;           /* Success/positive state */
--okay: #b7862f;           /* Warning state */
--bad: #a23b3b;            /* Danger/incident state */
```

**Key UI Patterns:**
- `.card` — Bordered content blocks
- `.srow` — Student/item list rows (expandable with `.expanded` state)
- `.chip` — Toggleable attribute badges (attendance, behavior, advancement readiness)
- `.seg` — Segmented control buttons
- `.tab` — Bottom navigation (sticky, with icons)

**Responsive:**
- Mobile-first design; max-width 760px container
- Safe area insets (`env(safe-area-inset-bottom)`) for notched devices
- Fixed bottom nav (88px safe area)

### Authentication Flow
1. User sees login form on page load
2. Clicks login → calls `supabase.auth.signInWithPassword(email, password)`
3. Coach emails are auto-mapped: "Coach Budi" → "coach.budi@kingzchess.internal"
4. Owner logs in with real email/password
5. Post-login, JS checks `auth.user()` role via coaches table query
6. Sets `body.is-admin` class if role = 'owner' (shows admin-only tabs)
7. Stores session in browser; page persists across reloads

---

## Development Workflows

### Local Development (No Build Step)
```bash
npm install
PORT=3000 node server.js
# Open http://localhost:3000
```

Server serves `public/index.html` as SPA; browser fetches config and connects to Supabase.

### Environment Variables (Required)
Create `.env` or `.env.local`:
```
SUPABASE_URL=https://dlfymynyzfqsippublvu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** These are embedded in README.md and workflows for this demo. In production, use Railway secrets manager.

### Deployment (Railway)
1. Push repo to GitHub
2. Connect to Railway; set env vars via Railway dashboard
3. Railway auto-detects `package.json` + `server.js`, runs `npm start`
4. App live at Railway-assigned URL

### Backup Workflow (GitHub Actions)
**File**: `.github/workflows/backup-sync.yml`

- Runs on `push main` or manual dispatch
- Uses `@supabase/supabase-js` service role to fetch all data
- Saves JSON backup to `backups/backup-TIMESTAMP.json`
- Commits backup back to repo
- Currently backs up tables referenced in code (`coaches`, `students`, `class_sessions`, `advancement_tracking`)

**Note:** Schema references `class_logs` and other tables; the backup script may need updates to match current schema if new tables are added.

---

## Key Conventions for AI Assistants

### File Organization
- `server.js` — Entry point, all backend logic (keep lightweight; no separate route files)
- `public/index.html` — All frontend code (no separate JS/CSS files)
- `schema.sql` — Database schema (run in Supabase SQL editor, never modify via migrations)
- `.github/workflows/` — CI/CD (backup automation)

### When Making Changes

#### Adding a New Table
1. Update `schema.sql` (add table + RLS policies)
2. Run manually in Supabase SQL Editor
3. Update backup script in `.github/workflows/backup-sync.yml` to include new table in `tables` array
4. Document table in `CLAUDE.md` > "Database Schema"

#### Adding a Frontend View (Tab)
1. Add HTML section with class `view` and ID (e.g., `#my-view`)
2. Add `.tab` button with matching data attribute
3. Add fetch/render logic in the inline JS script
4. Ensure RLS queries only select data the current role can see

#### Adding an Admin-Only Endpoint
1. Create in `server.js` as `POST /api/admin/...`
2. Use `adminClient` (service role) for auth-related ops
3. Document in CLAUDE.md > "API Endpoints"
4. Test that unauthenticated requests get 400/500

#### Adding an RLS Policy
1. Update `schema.sql` with new policy
2. Always use `get_my_role()` and `get_my_coach_id()` helpers for consistency
3. Run in Supabase SQL Editor
4. Test manually: verify owner sees all, coaches see only their data

### Code Style
- **No build tools** — vanilla JS (no transpilation, no bundling)
- **Formatting** — 2-space indents in JS, consistent SQL formatting in schema.sql
- **Comments** — Add only when logic is non-obvious; most code is self-documenting
- **Error handling** — Catch Supabase errors and show user-friendly messages (e.g., "Failed to add student")

### Testing
- **Manual UI testing** — Open app in browser, test each tab and role
- **RLS testing** — Create two auth sessions (coach + owner) and verify access
- **API testing** — Call admin endpoints via curl or Postman

### Security Notes
- **Never commit** `.env` or `.env.local` (in `.gitignore`)
- **Service role key** is powerful; only use server-side; never send to browser
- **Anon key** is sent to browser; RLS policies gate all queries
- **Internal emails** (`@kingzchess.internal`) allow coach login without real email
- **Accounting table** has strictest RLS (owner-only); verify on every schema change

---

## Common Tasks

### Adding a New Coach
```
POST /api/admin/create-coach
Body: { "name": "Coach Budi", "password": "secret123", "role": "coach" }
```
Creates auth user with email `coach.budi@kingzchess.internal` and coaches table entry.

### Bulk Backup
```bash
cd .github/workflows
node ../backup.js  # runs the inline backup script
```
Creates timestamped backup in `backups/` directory.

### Debugging RLS Access
1. Log in as two different users (coach + owner)
2. Open browser DevTools → Network tab
3. Check Supabase queries: coaches table query should filter by email for coaches, return all for owner
4. If access denied, verify `get_my_role()` function returns correct role

### Adding a New School
Only owner can add schools. UI form in "Schools" tab (admin-only). Submits to Supabase:
```js
supabase.from('schools').insert({ name, location, ... })
```

---

## Deployment Checklist

- [ ] All `.env` vars set in Railway dashboard
- [ ] Supabase RLS policies in place (schema.sql run)
- [ ] Email auth enabled in Supabase (no confirmation required)
- [ ] Owner account created (`POST /api/admin/create-coach`)
- [ ] First owner login succeeds
- [ ] Backup workflow has correct Supabase credentials
- [ ] `.gitignore` excludes `.env` and `node_modules/`

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Invalid login credentials" | Coach email not internal format | Ensure email = `coach.name@kingzchess.internal` |
| Coaches see owner data | RLS policy missing `get_my_role()` check | Update policy and re-run schema.sql |
| Backup fails | Schema mismatch (new table not in backup script) | Add table name to `tables` array in workflow |
| Admin endpoint 404 | Typo in route or wrong HTTP method | Check server.js path and method (POST vs GET) |
| Supabase auth always fails | Service key / anon key mismatch | Verify keys in Railway env vars match Supabase project |

---

## Related Files
- `README.md` — User setup guide (deployment, coach login, feature overview)
- `package.json` — Dependencies and Node version
- `nixpacks.toml` — Railway build config
- `.github/workflows/backup-sync.yml` — Backup automation

---

**Last Updated**: 2026-08-13  
**Maintained By**: AI Assistant (Claude)
