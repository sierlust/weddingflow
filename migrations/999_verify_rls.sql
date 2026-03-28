-- Phase 1.2.9: RLS Verification Script (Integration Test PoC)

-- 1. Create Test Roles
-- CREATE ROLE co_role;
-- CREATE ROLE supplier_admin_role;
-- CREATE ROLE supplier_staff_role;

-- 2. Mock Session for Couple Owner
-- CALL set_app_context('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', false);
-- SELECT * FROM weddings; -- Should return 'Sarah & Tom Summer Wedding'

-- 3. Mock Session for Supplier Admin (Assigned)
-- CALL set_app_context('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', false);
-- SELECT * FROM weddings; -- Should return 'Sarah & Tom Summer Wedding' (Assigned)

-- 4. Mock Session for Supplier Staff (NOT Assigned yet)
-- CALL set_app_context('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', false);
-- SELECT * FROM weddings; -- Should return EMPTY (Strict mode enabled, not assigned to this specific wedding)

-- 5. Assign Staff to Wedding
-- INSERT INTO wedding_supplier_staff_assignments (wedding_id, supplier_org_id, user_id) 
-- VALUES ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13');

-- 6. Verify Staff Access now works
-- SELECT * FROM weddings; -- Should now return 'Sarah & Tom Summer Wedding'

-- 7. Verify Platform Admin Bypass
-- CALL set_app_context('00000000-0000-0000-0000-000000000000', true);
-- SELECT COUNT(*) FROM weddings; -- Should return ALL rows
