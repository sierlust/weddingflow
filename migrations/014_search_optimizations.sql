-- Phase 3.3.4 & 3.3.6: Search Optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for title and location (using gin_trgm_ops for prefix/substring)
CREATE INDEX IF NOT EXISTS idx_weddings_search_trgm ON weddings USING GIN (title gin_trgm_ops, location gin_trgm_ops);

-- Index for wedding ID (exact match)
CREATE INDEX IF NOT EXISTS idx_weddings_id_search ON weddings(id);

-- GIN Index for staff names and participants would require a more complex setup if stored as arrays/jsonb,
-- for now we focus on the core wedding fields.
