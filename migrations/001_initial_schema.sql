-- Phase 1.1: Database Schema Design

-- Enums
CREATE TYPE wedding_status AS ENUM ('draft', 'active', 'completed', 'canceled');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');
CREATE TYPE assignment_status AS ENUM ('invited', 'active', 'removed');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    locale TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier Organizations
CREATE TABLE supplier_orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    categories TEXT[], -- Array of categories (e.g., {'Photographer', 'Caterer'})
    kvk_vat TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier Organization Members
CREATE TABLE supplier_org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff', -- 'admin' or 'staff'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, supplier_org_id)
);

-- Weddings
CREATE TABLE weddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    wedding_date DATE,
    timezone TEXT DEFAULT 'UTC',
    status wedding_status DEFAULT 'draft',
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wedding Members (Couple Owners + Collaborators)
CREATE TABLE wedding_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner', -- 'owner' or 'collaborator'
    permissions_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wedding_id, user_id)
);

-- Wedding Supplier Assignments
CREATE TABLE wedding_supplier_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    status assignment_status DEFAULT 'invited',
    category TEXT, -- Specific category for this wedding
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wedding_id, supplier_org_id)
);

-- Wedding Supplier Staff Assignments (Strict Access)
CREATE TABLE wedding_supplier_staff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wedding_id, supplier_org_id, user_id)
);

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- 'wedding_supplier_invite', 'org_member_invite', 'collaborator_invite'
    target_email TEXT NOT NULL,
    target_user_id UUID REFERENCES users(id),
    issuer_user_id UUID NOT NULL REFERENCES users(id),
    wedding_id UUID REFERENCES weddings(id) ON DELETE CASCADE,
    supplier_org_id UUID REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    status invitation_status DEFAULT 'pending',
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity Schema (SSO Readiness)
CREATE TYPE provider_type AS ENUM ('email_password', 'oidc_google', 'oidc_microsoft');

CREATE TABLE user_identity_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_type provider_type NOT NULL,
    provider_subject TEXT NOT NULL, -- Unique ID from the provider
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_type, provider_subject)
);

-- Indexes
CREATE INDEX idx_weddings_date ON weddings(wedding_date);
CREATE INDEX idx_wedding_members_wedding_id ON wedding_members(wedding_id);
CREATE INDEX idx_wedding_members_user_id ON wedding_members(user_id);
CREATE INDEX idx_supplier_org_members_org_id ON supplier_org_members(supplier_org_id);
CREATE INDEX idx_supplier_org_members_user_id ON supplier_org_members(user_id);
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX idx_invitations_target_email ON invitations(target_email);
CREATE INDEX idx_user_identity_providers_user_id ON user_identity_providers(user_id);
