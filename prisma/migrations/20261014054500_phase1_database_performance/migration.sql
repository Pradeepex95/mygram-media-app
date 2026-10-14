-- Stable keyset pagination and denormalized engagement counters.
ALTER TABLE "Post"
  ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commentCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Post" AS p
SET
  "likeCount" = (
    SELECT COUNT(*)::INTEGER
    FROM "Like" AS l
    WHERE l."postId" = p.id
  ),
  "commentCount" = (
    SELECT COUNT(*)::INTEGER
    FROM "Comment" AS c
    WHERE c."postId" = p.id
  );

CREATE INDEX "Post_createdAt_id_idx" ON "Post"("createdAt", "id");
CREATE INDEX "Comment_postId_createdAt_id_idx"
  ON "Comment"("postId", "createdAt", "id");
CREATE INDEX "AuditLog_createdAt_id_idx"
  ON "AuditLog"("createdAt", "id");
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");

-- User_username_key already supports equality lookup; remove the duplicate index.
DROP INDEX IF EXISTS "User_username_idx";
