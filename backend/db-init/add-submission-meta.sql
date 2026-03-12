-- Create tbl_submission_meta table to store upload metadata
CREATE TABLE IF NOT EXISTS tbl_submission_meta (
    submission_id UUID PRIMARY KEY,
    rubric_path TEXT DEFAULT '',
    question_path TEXT DEFAULT '',
    upload_type VARCHAR(50) DEFAULT 'papers',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_submission FOREIGN KEY (submission_id) 
        REFERENCES tbl_submissions(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_submission_meta_submission_id 
    ON tbl_submission_meta(submission_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_tbl_submission_meta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tbl_submission_meta_updated_at ON tbl_submission_meta;
CREATE TRIGGER trg_tbl_submission_meta_updated_at
    BEFORE UPDATE ON tbl_submission_meta
    FOR EACH ROW
    EXECUTE FUNCTION update_tbl_submission_meta_updated_at();

COMMENT ON TABLE tbl_submission_meta IS 'Metadata for submission uploads (paths, type, etc.)';

