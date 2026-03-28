-- Phase 4.2.4: Tab filters and categories
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT; -- 'Inspiration', 'Proposals/Quotes', 'Contracts', 'Run-of-show', etc.
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- Phase 4.2.2: Visibility scope index
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility_scope);
