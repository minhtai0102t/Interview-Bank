ALTER TABLE "practice_session"
  ADD COLUMN "currentPosition" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "practice_session_current_position_check" CHECK ("currentPosition" >= 1);