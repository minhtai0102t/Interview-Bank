-- Task 1 shared schema additions for collections, imports, review cards, and practice sessions.

CREATE TYPE "PracticeMode" AS ENUM ('REVIEW', 'MOCK');

CREATE TABLE "collection" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_item" (
    "collectionId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_item_pkey" PRIMARY KEY ("collectionId","questionId")
);

CREATE TABLE "import_receipt" (
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "questionIds" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_receipt_pkey" PRIMARY KEY ("userId","requestId")
);

CREATE TABLE "review_card" (
    "userId" TEXT NOT NULL,
    "questionId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "card" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_card_pkey" PRIMARY KEY ("userId","questionId")
);

CREATE TABLE "practice_session" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "PracticeMode" NOT NULL,
    "timeLimitMinutes" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "practice_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practice_item" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "responseMarkdown" TEXT NOT NULL DEFAULT '',
    "revealedAt" TIMESTAMPTZ(3),
    "rating" INTEGER,
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "practice_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collection_userId_updatedAt_id_idx" ON "collection"("userId", "updatedAt", "id");
CREATE INDEX "collection_item_questionId_idx" ON "collection_item"("questionId");
CREATE INDEX "import_receipt_userId_createdAt_idx" ON "import_receipt"("userId", "createdAt");
CREATE INDEX "review_card_userId_dueAt_questionId_idx" ON "review_card"("userId", "dueAt", "questionId");
CREATE INDEX "practice_session_userId_completedAt_startedAt_id_idx" ON "practice_session"("userId", "completedAt", "startedAt", "id");
CREATE UNIQUE INDEX "practice_item_sessionId_position_key" ON "practice_item"("sessionId", "position");
CREATE INDEX "practice_item_revisionId_idx" ON "practice_item"("revisionId");

ALTER TABLE "collection" ADD CONSTRAINT "collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_receipt" ADD CONSTRAINT "import_receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_item" ADD CONSTRAINT "practice_item_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_item" ADD CONSTRAINT "practice_item_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "question_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection"
  ADD CONSTRAINT "collection_name_check" CHECK ("name" ~ '\S' AND char_length("name") <= 160),
  ADD CONSTRAINT "collection_description_check" CHECK (octet_length("description") <= 4096);

ALTER TABLE "import_receipt"
  ADD CONSTRAINT "import_receipt_request_id_check" CHECK ("requestId" ~ '\S' AND char_length("requestId") <= 120),
  ADD CONSTRAINT "import_receipt_content_hash_check" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "import_receipt_question_ids_check" CHECK (cardinality("questionIds") >= 1);

ALTER TABLE "practice_session"
  ADD CONSTRAINT "practice_session_time_limit_check" CHECK ("timeLimitMinutes" IS NULL OR "timeLimitMinutes" BETWEEN 1 AND 480),
  ADD CONSTRAINT "practice_session_completed_after_started_check" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");

ALTER TABLE "practice_item"
  ADD CONSTRAINT "practice_item_position_check" CHECK ("position" >= 1),
  ADD CONSTRAINT "practice_item_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 4),
  ADD CONSTRAINT "practice_item_reviewed_requires_rating_check" CHECK (("reviewedAt" IS NULL AND "rating" IS NULL) OR ("reviewedAt" IS NOT NULL AND "rating" IS NOT NULL));