-- Rules that Prisma's schema language cannot express. The numbers mirror
-- QUESTION_LIMITS and MAX_ALIAS_CHARS in src/features/questions/limits.ts;
-- tests/integration/schema-constraints.test.ts checks both sides of every limit.

-- Roles: the application only knows these two.
ALTER TABLE "user"
  ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('USER', 'ADMIN'));

-- Profile: a public alias is optional, but when present it must be visible and short.
ALTER TABLE "profile"
  ADD CONSTRAINT "profile_alias_check"
  CHECK ("publicAlias" IS NULL OR ("publicAlias" ~ '\S' AND char_length("publicAlias") <= 40));

-- Topic: URL-safe slug and a visible label.
ALTER TABLE "topic"
  ADD CONSTRAINT "topic_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "topic_label_check" CHECK ("label" ~ '\S');

-- Tags: at most 8, each visible and at most 40 characters, no nulls, never a missing list.
CREATE FUNCTION "question_tags_valid"("tags" text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT "tags" IS NOT NULL
    AND cardinality("tags") <= 8
    AND NOT EXISTS (
      SELECT 1 FROM unnest("tags") AS "item"("tag")
      WHERE "tag" IS NULL OR "tag" !~ '\S' OR char_length("tag") > 40
    )
$$;

-- Question: the working copy. An answer may still be empty while it is being written.
ALTER TABLE "question"
  ADD CONSTRAINT "question_title_check" CHECK ("title" ~ '\S' AND char_length("title") <= 160),
  ADD CONSTRAINT "question_prompt_check" CHECK ("promptMarkdown" ~ '\S' AND octet_length("promptMarkdown") <= 20480),
  ADD CONSTRAINT "question_answer_check" CHECK (octet_length("answerMarkdown") <= 61440),
  ADD CONSTRAINT "question_tags_check" CHECK ("question_tags_valid"("tags")),
  ADD CONSTRAINT "question_draft_version_check" CHECK ("draftVersion" >= 1);

-- Revision: a snapshot taken at publication, so it must be complete.
ALTER TABLE "question_revision"
  ADD CONSTRAINT "question_revision_title_check" CHECK ("title" ~ '\S' AND char_length("title") <= 160),
  ADD CONSTRAINT "question_revision_prompt_check" CHECK ("promptMarkdown" ~ '\S' AND octet_length("promptMarkdown") <= 20480),
  ADD CONSTRAINT "question_revision_answer_check" CHECK ("answerMarkdown" ~ '\S' AND octet_length("answerMarkdown") <= 61440),
  ADD CONSTRAINT "question_revision_tags_check" CHECK ("question_tags_valid"("tags")),
  ADD CONSTRAINT "question_revision_draft_version_check" CHECK ("draftVersion" >= 1);

-- Revision content is frozen: practice history points at it, so only the publication time may change.
CREATE FUNCTION "question_revision_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."id", NEW."questionId", NEW."draftVersion", NEW."title", NEW."promptMarkdown",
         NEW."answerMarkdown", NEW."topicId", NEW."difficulty", NEW."tags", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."questionId", OLD."draftVersion", OLD."title", OLD."promptMarkdown",
         OLD."answerMarkdown", OLD."topicId", OLD."difficulty", OLD."tags", OLD."createdAt")
  THEN
    RAISE EXCEPTION 'question_revision_immutable: only publishedAt of a revision may change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'question_revision_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_revision_immutable"
  BEFORE UPDATE ON "question_revision"
  FOR EACH ROW EXECUTE FUNCTION "question_revision_guard_immutable"();