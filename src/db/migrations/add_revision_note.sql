-- Migration: Add revision_note field to document_recipients table
-- This field stores the note when a document is sent back for revision

ALTER TABLE document_recipients 
ADD COLUMN IF NOT EXISTS revision_note TEXT;

-- Update status comment to include new status
COMMENT ON COLUMN document_recipients.status IS 'pending, draft, signed, sent_back_for_signing';

-- Update documents status comment to include new status
COMMENT ON COLUMN documents.status IS 'draft, sent_for_signing, pending, waiting_confirmation, sent_back_for_signing, completed';

