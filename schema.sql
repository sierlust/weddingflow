-- ManagementApp Wedding Platform — Supabase Schema
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kpsamcrxnkcjfgspyogs/sql/new
--
-- WARNING: This drops and recreates the public schema entirely.
-- All existing tables (payments, contacts, orders, etc.) will be deleted.

-- Clean
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  UNIQUE(provider_type, provider_subject)
);

CREATE TABLE refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weddings
CREATE TABLE weddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  wedding_date DATE,
  location TEXT,
  status TEXT DEFAULT 'active',
  owner_id UUID REFERENCES users(id),
  couple_names TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  supplier_org_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  category TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wedding_id, supplier_org_id)
);

CREATE TABLE staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id),
  invited_email TEXT NOT NULL,
  supplier_org_id TEXT,
  type TEXT DEFAULT 'supplier_invite',
  status TEXT DEFAULT 'pending',
  token TEXT UNIQUE,
  message TEXT,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier profiles
CREATE TABLE supplier_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  category TEXT,
  location TEXT,
  website TEXT,
  instagram TEXT,
  bio TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'Europe/Amsterdam',
  location_or_link TEXT,
  notes TEXT,
  visibility_scope TEXT DEFAULT 'all_assigned_suppliers',
  created_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ical_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'group',
  title TEXT,
  pinned BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_participants (
  thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  url TEXT,
  category TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Run-of-Show
CREATE TABLE ros_drafts (
  wedding_id UUID PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  draft_json JSONB DEFAULT '[]',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ros_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  items JSONB DEFAULT '[]',
  published_by UUID REFERENCES users(id),
  change_summary TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ros_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES ros_versions(id) ON DELETE CASCADE,
  item_id TEXT,
  supplier_org_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  reason TEXT,
  proposed_values JSONB,
  status TEXT DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Guests
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  rsvp_status TEXT DEFAULT 'pending',
  dietary TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  due_date DATE,
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget
CREATE TABLE budget_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  category TEXT,
  paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
