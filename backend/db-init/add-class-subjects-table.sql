-- Add Class-Subjects Junction Table
-- Many-to-Many relationship: Classes can have multiple subjects, subjects can be in multiple classes

CREATE TABLE IF NOT EXISTS tbl_class_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_class FOREIGN KEY (class_id) REFERENCES tbl_classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_subject FOREIGN KEY (subject_id) REFERENCES tbl_subjects(id) ON DELETE CASCADE,
    CONSTRAINT unique_class_subject UNIQUE (class_id, subject_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON tbl_class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON tbl_class_subjects(subject_id);

COMMENT ON TABLE tbl_class_subjects IS 'Junction table linking classes to subjects (many-to-many)';

