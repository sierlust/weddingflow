-- Phase 1.1.9: Seed Data for Local Development

-- Users
INSERT INTO users (id, email, name, locale) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'couple@example.com', 'Sarah & Tom', 'nl'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'supplier_admin@example.com', 'John Photographer', 'nl'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'supplier_staff@example.com', 'Jane Assistant', 'nl')
ON CONFLICT DO NOTHING;

-- Supplier Orgs
INSERT INTO supplier_orgs (id, name, categories, kvk_vat, address) VALUES 
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'Perfect Shots Photography', '{"Photographer"}', '12345678', 'Amsterdamseweg 1, Amsterdam')
ON CONFLICT DO NOTHING;

-- Membership
INSERT INTO supplier_org_members (user_id, supplier_org_id, role) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'admin'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'staff')
ON CONFLICT DO NOTHING;

-- Wedding
INSERT INTO weddings (id, title, wedding_date, status, location) VALUES 
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Sarah & Tom Summer Wedding', '2026-07-15', 'active', 'Kasteel de Haar')
ON CONFLICT DO NOTHING;

-- Wedding Owner
INSERT INTO wedding_members (wedding_id, user_id, role) VALUES 
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'owner')
ON CONFLICT DO NOTHING;

-- Assignment
INSERT INTO wedding_supplier_assignments (wedding_id, supplier_org_id, status, category) VALUES 
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'active', 'Photographer')
ON CONFLICT DO NOTHING;
