-- Phase 3.1.8 Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_wedding_org_status ON tasks(wedding_id, supplier_org_id, status) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS idx_appointments_next_appt ON appointments(wedding_id, start_at) WHERE start_at >= NOW();
CREATE INDEX IF NOT EXISTS idx_thread_participants_user_read ON thread_participants(user_id, last_read_at);
CREATE INDEX IF NOT EXISTS idx_weddings_pagination ON weddings(wedding_date, id);
