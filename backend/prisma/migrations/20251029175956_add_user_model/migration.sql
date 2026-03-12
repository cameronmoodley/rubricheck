-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "public"."submission_status" AS ENUM ('PENDING', 'GRADING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."tbl_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'TEACHER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tbl_rubrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tbl_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rubric_id" UUID NOT NULL,
    "status" "public"."submission_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tbl_papers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "subject_id" UUID,
    "student_name" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tbl_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tbl_grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "student_name" TEXT NOT NULL,
    "criteria_scores" JSONB NOT NULL,
    "total_score" DECIMAL(6,2) NOT NULL,
    "comments" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_users_email_key" ON "public"."tbl_users"("email");

-- CreateIndex
CREATE INDEX "idx_tbl_submissions_status_created" ON "public"."tbl_submissions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_tbl_papers_submission" ON "public"."tbl_papers"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "public"."tbl_subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "public"."tbl_subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grades_paper_id_key" ON "public"."tbl_grades"("paper_id");

-- CreateIndex
CREATE INDEX "idx_tbl_grades_submission" ON "public"."tbl_grades"("submission_id");

-- AddForeignKey
ALTER TABLE "public"."tbl_submissions" ADD CONSTRAINT "submissions_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."tbl_rubrics"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tbl_papers" ADD CONSTRAINT "papers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."tbl_submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tbl_papers" ADD CONSTRAINT "papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."tbl_subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tbl_grades" ADD CONSTRAINT "grades_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."tbl_papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tbl_grades" ADD CONSTRAINT "grades_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."tbl_submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
