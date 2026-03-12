-- Quiz Grading Tables for RubriCheck
-- These tables handle AI grading of Moodle quiz attempts
-- Separate from existing manual marking tables (tbl_papers, tbl_grades, etc.)

-- 1. Quiz Grading Jobs Table
-- Tracks each grading session initiated by a user
CREATE TABLE tbl_quiz_grading_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id INTEGER NOT NULL,
    quiz_name VARCHAR(255) NOT NULL,
    course_id INTEGER NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    total_attempts INTEGER NOT NULL DEFAULT 0,
    processed_attempts INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(255), -- User who initiated grading
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    
    CONSTRAINT chk_quiz_grading_jobs_status 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Index for efficient querying
CREATE INDEX idx_tbl_quiz_grading_jobs_quiz_id ON tbl_quiz_grading_jobs(quiz_id);
CREATE INDEX idx_tbl_quiz_grading_jobs_status ON tbl_quiz_grading_jobs(status);
CREATE INDEX idx_tbl_quiz_grading_jobs_created_at ON tbl_quiz_grading_jobs(created_at DESC);

-- 2. Quiz Grading Results Table
-- Stores individual attempt grades and feedback
CREATE TABLE tbl_quiz_grading_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES tbl_quiz_grading_jobs(id) ON DELETE CASCADE,
    attempt_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    attempt_number INTEGER NOT NULL,
    score DECIMAL(6,2), -- Raw score from AI grading
    max_score DECIMAL(6,2) NOT NULL, -- Maximum possible score
    percentage DECIMAL(5,2), -- Calculated percentage
    good_comments TEXT, -- Positive feedback
    bad_comments TEXT, -- Areas for improvement
    grading_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, graded, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    graded_at TIMESTAMPTZ,
    error_message TEXT,
    
    CONSTRAINT chk_quiz_grading_results_status 
        CHECK (grading_status IN ('pending', 'graded', 'failed')),
    CONSTRAINT chk_quiz_grading_results_score 
        CHECK (score IS NULL OR (score >= 0 AND score <= max_score))
);

-- Indexes for efficient querying
CREATE INDEX idx_tbl_quiz_grading_results_job_id ON tbl_quiz_grading_results(job_id);
CREATE INDEX idx_tbl_quiz_grading_results_attempt_id ON tbl_quiz_grading_results(attempt_id);
CREATE INDEX idx_tbl_quiz_grading_results_user_id ON tbl_quiz_grading_results(user_id);
CREATE INDEX idx_tbl_quiz_grading_results_status ON tbl_quiz_grading_results(grading_status);

-- 3. Quiz Attempts Cache Table
-- Caches attempt data fetched from Moodle to avoid re-fetching
CREATE TABLE tbl_quiz_attempts_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id INTEGER NOT NULL,
    attempt_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_data JSONB NOT NULL, -- User name, email, etc.
    attempt_data JSONB NOT NULL, -- Quiz answers, timestamps, etc.
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    is_expired BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Ensure unique attempt per quiz
    UNIQUE(quiz_id, attempt_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_tbl_quiz_attempts_cache_quiz_id ON tbl_quiz_attempts_cache(quiz_id);
CREATE INDEX idx_tbl_quiz_attempts_cache_expires_at ON tbl_quiz_attempts_cache(expires_at);
CREATE INDEX idx_tbl_quiz_attempts_cache_is_expired ON tbl_quiz_attempts_cache(is_expired);

-- 4. Moodle Sync Status Table
-- Tracks what grades have been posted back to Moodle
CREATE TABLE tbl_moodle_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES tbl_quiz_grading_results(id) ON DELETE CASCADE,
    moodle_attempt_id INTEGER NOT NULL,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, success, failed
    sync_attempts INTEGER NOT NULL DEFAULT 0,
    last_sync_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_moodle_sync_status 
        CHECK (sync_status IN ('pending', 'success', 'failed'))
);

-- Indexes for efficient querying
CREATE INDEX idx_tbl_moodle_sync_status_result_id ON tbl_moodle_sync_status(result_id);
CREATE INDEX idx_tbl_moodle_sync_status_status ON tbl_moodle_sync_status(sync_status);
CREATE INDEX idx_tbl_moodle_sync_status_moodle_attempt_id ON tbl_moodle_sync_status(moodle_attempt_id);

-- 5. Quiz Metadata Cache Table
-- Caches quiz questions, rubric, and other metadata
CREATE TABLE tbl_quiz_metadata_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id INTEGER NOT NULL UNIQUE,
    quiz_name VARCHAR(255) NOT NULL,
    course_id INTEGER NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    quiz_data JSONB NOT NULL, -- Questions, rubric, settings
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    is_expired BOOLEAN NOT NULL DEFAULT FALSE
);

-- Index for efficient querying
CREATE INDEX idx_tbl_quiz_metadata_cache_quiz_id ON tbl_quiz_metadata_cache(quiz_id);
CREATE INDEX idx_tbl_quiz_metadata_cache_expires_at ON tbl_quiz_metadata_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE tbl_quiz_grading_jobs IS 'Tracks each AI grading session for a quiz';
COMMENT ON TABLE tbl_quiz_grading_results IS 'Stores individual attempt grades and feedback from AI';
COMMENT ON TABLE tbl_quiz_attempts_cache IS 'Caches quiz attempt data from Moodle to avoid re-fetching';
COMMENT ON TABLE tbl_moodle_sync_status IS 'Tracks synchronization of grades back to Moodle';
COMMENT ON TABLE tbl_quiz_metadata_cache IS 'Caches quiz metadata (questions, rubric) from Moodle';

-- Add some helpful views for common queries
CREATE VIEW vw_quiz_grading_summary AS
SELECT 
    j.id as job_id,
    j.quiz_id,
    j.quiz_name,
    j.course_name,
    j.status,
    j.total_attempts,
    j.processed_attempts,
    j.failed_attempts,
    j.created_at,
    j.completed_at,
    CASE 
        WHEN j.status = 'completed' THEN '100%'
        WHEN j.total_attempts = 0 THEN '0%'
        ELSE ROUND((j.processed_attempts::DECIMAL / j.total_attempts) * 100, 1) || '%'
    END as progress_percentage
FROM tbl_quiz_grading_jobs j;

CREATE VIEW vw_quiz_grading_results_summary AS
SELECT 
    r.job_id,
    r.attempt_id,
    r.user_name,
    r.user_email,
    r.score,
    r.max_score,
    r.percentage,
    r.grading_status,
    s.sync_status,
    r.graded_at
FROM tbl_quiz_grading_results r
LEFT JOIN tbl_moodle_sync_status s ON r.id = s.result_id;
