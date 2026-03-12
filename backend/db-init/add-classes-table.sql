-- Add Classes Table
-- A class represents a course section/offering (e.g., "Grade 10A", "CS101 Fall 2024")

CREATE TABLE IF NOT EXISTS tbl_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    teacher_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) REFERENCES tbl_users(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tbl_classes_name ON tbl_classes(name);
CREATE INDEX IF NOT EXISTS idx_tbl_classes_code ON tbl_classes(code);
CREATE INDEX IF NOT EXISTS idx_tbl_classes_teacher ON tbl_classes(teacher_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_tbl_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tbl_classes_updated_at ON tbl_classes;
CREATE TRIGGER trg_tbl_classes_updated_at
    BEFORE UPDATE ON tbl_classes
    FOR EACH ROW
    EXECUTE FUNCTION update_tbl_classes_updated_at();

COMMENT ON TABLE tbl_classes IS 'Course sections/offerings (e.g., Grade 10A, CS101 Fall 2024)';

