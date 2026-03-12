BEGIN;

-- Prereqs (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE submission_status AS ENUM ('PENDING', 'GRADING', 'COMPLETED', 'FAILED');
  END IF;
END$$;

-- 1) Rename tables if old (unprefixed) versions exist
DO $$
BEGIN
  IF to_regclass('public.rubrics') IS NOT NULL AND to_regclass('public.tbl_rubrics') IS NULL THEN
    EXECUTE 'ALTER TABLE rubrics RENAME TO tbl_rubrics';
  END IF;

  IF to_regclass('public.submissions') IS NOT NULL AND to_regclass('public.tbl_submissions') IS NULL THEN
    EXECUTE 'ALTER TABLE submissions RENAME TO tbl_submissions';
  END IF;

  IF to_regclass('public.papers') IS NOT NULL AND to_regclass('public.tbl_papers') IS NULL THEN
    EXECUTE 'ALTER TABLE papers RENAME TO tbl_papers';
  END IF;

  IF to_regclass('public.grades') IS NOT NULL AND to_regclass('public.tbl_grades') IS NULL THEN
    EXECUTE 'ALTER TABLE grades RENAME TO tbl_grades';
  END IF;
END$$;

-- 2) Create prefixed tables if this is a fresh DB (no prior tables)
-- (References rely on creation order; we guard each with NOT EXISTS)
DO $$
BEGIN
  IF to_regclass('public.tbl_rubrics') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE tbl_rubrics (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title       text NOT NULL,
        criteria    jsonb NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    $SQL$;
  END IF;

  IF to_regclass('public.tbl_submissions') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE tbl_submissions (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rubric_id   uuid NOT NULL REFERENCES tbl_rubrics(id) ON DELETE RESTRICT,
        status      submission_status NOT NULL DEFAULT 'PENDING',
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    $SQL$;
  END IF;

  IF to_regclass('public.tbl_papers') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE tbl_papers (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id     uuid NOT NULL REFERENCES tbl_submissions(id) ON DELETE CASCADE,
        student_name      text NOT NULL,
        original_filename text,
        mime_type         text,
        storage_path      text NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    $SQL$;
  END IF;

  IF to_regclass('public.tbl_grades') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE tbl_grades (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id   uuid NOT NULL REFERENCES tbl_submissions(id) ON DELETE CASCADE,
        paper_id        uuid NOT NULL UNIQUE REFERENCES tbl_papers(id) ON DELETE CASCADE,
        student_name    text NOT NULL,
        criteria_scores jsonb NOT NULL,
        total_score     numeric(6,2) NOT NULL,
        comments        text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    $SQL$;
  END IF;
END$$;

-- 3) Recreate/ensure indexes (drop old names if present)
DROP INDEX IF EXISTS idx_submissions_status_created;
DROP INDEX IF EXISTS idx_tbl_submissions_status_created;
CREATE INDEX IF NOT EXISTS idx_tbl_submissions_status_created
  ON tbl_submissions(status, created_at DESC);

DROP INDEX IF EXISTS idx_papers_submission;
DROP INDEX IF EXISTS idx_tbl_papers_submission;
CREATE INDEX IF NOT EXISTS idx_tbl_papers_submission
  ON tbl_papers(submission_id);

DROP INDEX IF EXISTS idx_grades_submission;
DROP INDEX IF EXISTS idx_tbl_grades_submission;
CREATE INDEX IF NOT EXISTS idx_tbl_grades_submission
  ON tbl_grades(submission_id);

-- 4) Trigger function and trigger on tbl_grades.updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

-- Drop triggers with both old and new names (idempotent)
DO $$
BEGIN
  IF to_regclass('public.tbl_grades') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tbl_grades'::regclass AND tgname = 'trg_grades_updated_at') THEN
      EXECUTE 'DROP TRIGGER trg_grades_updated_at ON tbl_grades';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tbl_grades'::regclass AND tgname = 'trg_tbl_grades_updated_at') THEN
      EXECUTE 'DROP TRIGGER trg_tbl_grades_updated_at ON tbl_grades';
    END IF;
    EXECUTE 'CREATE TRIGGER trg_tbl_grades_updated_at BEFORE UPDATE ON tbl_grades FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END$$;

COMMIT;


