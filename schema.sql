-- ============================================================
-- KINGZ CHESS ACADEMY CRM — SUPABASE SCHEMA
-- Run this in Supabase → SQL Editor
-- ============================================================

-- COACHES
create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null default 'coach', -- 'coach' | 'owner'
  active boolean default true,
  created_at timestamptz default now()
);

-- SCHOOLS
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  coordinator_name text,
  coordinator_contact text,
  renewal_date date,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- STUDENTS
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id uuid references schools(id) on delete set null,
  current_tier integer default 1 check (current_tier between 1 and 6),
  type text not null default 'school', -- 'school' | 'private'
  parent_name text,
  parent_phone text,
  parent_contact text,
  notes text,
  active boolean default true,
  added_by uuid references coaches(id) on delete set null,
  created_at timestamptz default now()
);

-- CLASS LOGS
create table if not exists class_logs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id) on delete set null,
  school_id uuid references schools(id) on delete set null,
  class_type text not null default 'school', -- 'school' | 'private'
  class_date date not null default current_date,
  topic text,
  notes text,
  created_at timestamptz default now()
);

-- STUDENT CLASS ENTRIES (per-student data within a class log)
create table if not exists student_class_entries (
  id uuid primary key default gen_random_uuid(),
  class_log_id uuid references class_logs(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  present boolean default true,
  understood_topic boolean default false,
  behavior text default 'good', -- 'good' | 'needs_attention' | 'incident'
  incident_note text,
  note text,
  ready_to_advance boolean default false,
  created_at timestamptz default now()
);

-- TIER PROMOTION REQUESTS
create table if not exists promotion_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  requested_by uuid references coaches(id) on delete set null,
  from_tier integer not null,
  to_tier integer not null,
  reason text,
  status text default 'pending', -- 'pending' | 'approved' | 'held'
  reviewed_by uuid references coaches(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now()
);

-- SCHEDULE
create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  coach_id uuid references coaches(id) on delete set null,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Sun
  start_time time not null,
  end_time time not null,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

-- SCHEDULE CHANGE REQUESTS
create table if not exists schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references schedule_slots(id) on delete cascade,
  requested_by uuid references coaches(id) on delete set null,
  requested_date date,
  requested_day integer check (requested_day between 0 and 6),
  requested_start time,
  requested_end time,
  reason text,
  status text default 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid references coaches(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ACCOUNTING (owner only — never exposed via coach API calls)
create table if not exists accounting (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  school_id uuid references schools(id) on delete set null,
  type text not null, -- 'payment' | 'invoice' | 'expense'
  amount numeric(10,2) not null,
  currency text default 'IDR',
  description text,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table coaches enable row level security;
alter table schools enable row level security;
alter table students enable row level security;
alter table class_logs enable row level security;
alter table student_class_entries enable row level security;
alter table promotion_requests enable row level security;
alter table schedule_slots enable row level security;
alter table schedule_change_requests enable row level security;
alter table accounting enable row level security;

-- Helper: get current user's role
create or replace function get_my_role()
returns text language sql security definer as $$
  select role from coaches where email = auth.email() limit 1;
$$;

-- Helper: get current user's coach id
create or replace function get_my_coach_id()
returns uuid language sql security definer as $$
  select id from coaches where email = auth.email() limit 1;
$$;

-- COACHES: owner sees all, coaches see only themselves
create policy "coaches_select" on coaches for select using (
  get_my_role() = 'owner' or email = auth.email()
);
create policy "coaches_insert" on coaches for insert with check (get_my_role() = 'owner');
create policy "coaches_update" on coaches for update using (get_my_role() = 'owner');

-- SCHOOLS: owner full access, coaches read only
create policy "schools_select" on schools for select using (true);
create policy "schools_insert" on schools for insert with check (get_my_role() = 'owner');
create policy "schools_update" on schools for update using (get_my_role() = 'owner');

-- STUDENTS: coaches can add and read, owner can edit
create policy "students_select" on students for select using (true);
create policy "students_insert" on students for insert with check (auth.role() = 'authenticated');
create policy "students_update" on students for update using (get_my_role() = 'owner');

-- CLASS LOGS: coaches write own, all read
create policy "class_logs_select" on class_logs for select using (true);
create policy "class_logs_insert" on class_logs for insert with check (auth.role() = 'authenticated');
create policy "class_logs_update" on class_logs for update using (
  get_my_role() = 'owner' or coach_id = get_my_coach_id()
);

-- STUDENT CLASS ENTRIES: full access for authenticated
create policy "sce_select" on student_class_entries for select using (true);
create policy "sce_insert" on student_class_entries for insert with check (auth.role() = 'authenticated');
create policy "sce_update" on student_class_entries for update using (auth.role() = 'authenticated');

-- PROMOTION REQUESTS: coaches create, owner approves
create policy "promo_select" on promotion_requests for select using (true);
create policy "promo_insert" on promotion_requests for insert with check (auth.role() = 'authenticated');
create policy "promo_update" on promotion_requests for update using (get_my_role() = 'owner');

-- SCHEDULE: all read, owner writes
create policy "schedule_select" on schedule_slots for select using (true);
create policy "schedule_insert" on schedule_slots for insert with check (get_my_role() = 'owner');
create policy "schedule_update" on schedule_slots for update using (get_my_role() = 'owner');

-- SCHEDULE CHANGE REQUESTS: coaches create, owner approves
create policy "scr_select" on schedule_change_requests for select using (true);
create policy "scr_insert" on schedule_change_requests for insert with check (auth.role() = 'authenticated');
create policy "scr_update" on schedule_change_requests for update using (get_my_role() = 'owner');

-- ACCOUNTING: owner only
create policy "accounting_select" on accounting for select using (get_my_role() = 'owner');
create policy "accounting_insert" on accounting for insert with check (get_my_role() = 'owner');
create policy "accounting_update" on accounting for update using (get_my_role() = 'owner');
create policy "accounting_delete" on accounting for delete using (get_my_role() = 'owner');
