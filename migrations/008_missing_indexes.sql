-- Phase 1.1.8: Missing Performance Indexes for Core Tables

-- Wedding Supplier Assignments
CREATE INDEX IF NOT EXISTS idx_wedding_supplier_assignments_wedding_id ON wedding_supplier_assignments(wedding_id);
CREATE INDEX IF NOT EXISTS idx_wedding_supplier_assignments_org_id ON wedding_supplier_assignments(supplier_org_id);

-- Wedding Supplier Staff Assignments
CREATE INDEX IF NOT EXISTS idx_wedding_supplier_staff_assignments_wedding_id ON wedding_supplier_staff_assignments(wedding_id);
CREATE INDEX IF NOT EXISTS idx_wedding_supplier_staff_assignments_org_id ON wedding_supplier_staff_assignments(supplier_org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_supplier_staff_assignments_user_id ON wedding_supplier_staff_assignments(user_id);

-- Invitations
CREATE INDEX IF NOT EXISTS idx_invitations_wedding_id ON invitations(wedding_id);
CREATE INDEX IF NOT EXISTS idx_invitations_supplier_org_id ON invitations(supplier_org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_issuer_id ON invitations(issuer_user_id);
