-- Interview scheduling: rounds, panel assignments, feedback, reschedule history, soft cancellations.

CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW');
CREATE TYPE "InterviewInterviewerRole" AS ENUM ('TECHNICAL_INTERVIEWER', 'HIRING_MANAGER', 'HR_INTERVIEWER');
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE', 'STRONG_NO_HIRE');

CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "interview_type" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "meeting_link" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_interviewers" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "InterviewInterviewerRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_interviewers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_feedback" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "rating" INTEGER,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "recommendation" "InterviewRecommendation" NOT NULL,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_schedule_changes" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "from_scheduled_at" TIMESTAMP(3) NOT NULL,
    "to_scheduled_at" TIMESTAMP(3) NOT NULL,
    "from_duration_minutes" INTEGER NOT NULL,
    "to_duration_minutes" INTEGER NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_schedule_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_cancellations" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_status" "InterviewStatus" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "cancelled_by" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_cancellations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interview_interviewers_interview_id_user_id_key" ON "interview_interviewers"("interview_id", "user_id");
CREATE INDEX "interview_interviewers_interview_id_idx" ON "interview_interviewers"("interview_id");
CREATE INDEX "interview_interviewers_user_id_idx" ON "interview_interviewers"("user_id");
CREATE INDEX "interview_interviewers_interview_id_role_idx" ON "interview_interviewers"("interview_id", "role");

CREATE UNIQUE INDEX "interview_feedback_interview_id_reviewer_id_key" ON "interview_feedback"("interview_id", "reviewer_id");
CREATE INDEX "interview_feedback_interview_id_idx" ON "interview_feedback"("interview_id");
CREATE INDEX "interview_feedback_reviewer_id_idx" ON "interview_feedback"("reviewer_id");

CREATE INDEX "interview_schedule_changes_interview_id_idx" ON "interview_schedule_changes"("interview_id");
CREATE INDEX "interview_schedule_changes_changed_by_idx" ON "interview_schedule_changes"("changed_by");
CREATE INDEX "interview_schedule_changes_changed_at_idx" ON "interview_schedule_changes"("changed_at");

CREATE UNIQUE INDEX "interview_cancellations_interview_id_key" ON "interview_cancellations"("interview_id");
CREATE INDEX "interview_cancellations_cancelled_by_idx" ON "interview_cancellations"("cancelled_by");
CREATE INDEX "interview_cancellations_cancelled_at_idx" ON "interview_cancellations"("cancelled_at");

CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");
CREATE INDEX "interviews_scheduled_at_idx" ON "interviews"("scheduled_at");
CREATE INDEX "interviews_status_idx" ON "interviews"("status");

ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_schedule_changes" ADD CONSTRAINT "interview_schedule_changes_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_schedule_changes" ADD CONSTRAINT "interview_schedule_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_cancellations" ADD CONSTRAINT "interview_cancellations_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_cancellations" ADD CONSTRAINT "interview_cancellations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
